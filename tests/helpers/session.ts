/**
 * P-01 — Real-database test harness: authenticated requests.
 *
 * ============================================================================
 * THERE IS NO MOCK SEAM HERE. THE TOKEN IS REAL.
 * ============================================================================
 *
 * The package card allowed a documented mock seam if a genuinely signed token
 * proved impractical, and warned that a loose seam would let a later package
 * "pass" a tenancy test without proving anything. It is not needed and none is
 * used, so there is nothing loose to warn about.
 *
 * `withAuth` in `src/shared/middleware/auth.ts` calls
 * `getToken({ req, secret: process.env.NEXTAUTH_SECRET })`. In NextAuth v4 that
 * reads the `next-auth.session-token` cookie and decrypts it as a JWE
 * (`dir` + `A256GCM`, key derived from the secret by HKDF). `next-auth/jwt`
 * exports the matching `encode`, so this file mints exactly the token NextAuth
 * would have issued after a successful sign-in and puts it in exactly the
 * cookie a browser would send.
 *
 * Consequences worth stating, because they are the reason to prefer this over a
 * `jest.mock('next-auth/jwt')`:
 *
 *   - `getToken` is NOT mocked. The production decrypt path runs.
 *   - A token minted with the wrong secret produces a real 401, not a stub one.
 *   - A tampered or expired token fails the way it fails in production.
 *   - Nothing under `src/` is patched, so a route that stopped calling
 *     `withAuth` would start returning 200 to `anonymousRequest` and the test
 *     would catch it. A mocked seam would not.
 *
 * `tests/db/harness.test.ts` asserts each of those, so the seam cannot quietly
 * loosen later.
 *
 * ============================================================================
 * NEXTAUTH_SECRET
 * ============================================================================
 *
 * CI sets it (`.github/workflows/ci.yml`, `db-test` job). Locally there is no
 * `.env` and this harness does not create one, so if it is unset this module
 * assigns a test-only value into `process.env` at import time. That keeps the
 * minting side and the verifying side reading the same variable -- both read
 * `process.env.NEXTAUTH_SECRET` at call time -- so they cannot disagree. It is
 * a default, not a bypass: the crypto still runs both ways.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   const { tenantA, tenantB } = await createTwoTenants();
 *
 *   // GET, cross-tenant
 *   await GET(requestAs(tenantA, `/api/tasks?entityId=${tenantB.entity.id}`));
 *
 *   // POST with a JSON body
 *   await POST(requestAs(tenantA, '/api/tasks', {
 *     method: 'POST',
 *     body: { title: 'x', entityId: tenantB.entity.id },
 *   }));
 *
 *   // no session at all
 *   await GET(anonymousRequest('/api/tasks'));
 *
 * `requestAs` is synchronous on purpose: the token is minted once when the
 * tenant is created, so a test reads `await GET(requestAs(...))` rather than
 * `await GET(await requestAs(...))`.
 */

import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import type { UserRole } from '@/lib/auth/types';

/** Test-only fallback. See the NEXTAUTH_SECRET note above. */
export const TEST_NEXTAUTH_SECRET = 'p01-test-harness-secret-do-not-use-in-production';

if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = TEST_NEXTAUTH_SECRET;
}

/** The claims `withAuth` reads off the decrypted token. */
export interface SessionClaims {
  userId: string;
  email?: string;
  name?: string;
  role?: UserRole;
  activeEntityId?: string;
}

/**
 * Mint a real, encrypted NextAuth session JWT for these claims.
 *
 * `maxAge` is in seconds and defaults to an hour. Pass a negative value to mint
 * an already-expired token -- `getToken` will reject it, which is how a test
 * proves the verification is genuine.
 */
export async function sessionTokenFor(
  claims: SessionClaims,
  options: { maxAge?: number; secret?: string } = {}
): Promise<string> {
  const secret = options.secret ?? process.env.NEXTAUTH_SECRET!;
  return encode({
    token: {
      userId: claims.userId,
      email: claims.email ?? '',
      name: claims.name ?? '',
      role: claims.role ?? 'owner',
      activeEntityId: claims.activeEntityId,
    },
    secret,
    maxAge: options.maxAge ?? 60 * 60,
  });
}

/** Anything that can present a session: a Tenant, or a bare token. */
export type Actor = { token: string } | string;

function tokenOf(actor: Actor): string {
  return typeof actor === 'string' ? actor : actor.token;
}

/**
 * Both cookie names NextAuth might look for.
 *
 * `getToken` chooses `__Secure-next-auth.session-token` when `NEXTAUTH_URL` is
 * https or `VERCEL` is set, and the plain name otherwise. Setting both means a
 * test behaves the same however the environment happens to be configured, and
 * the two names do not prefix-match each other, so NextAuth's chunk reassembly
 * still picks exactly one.
 */
function cookieHeader(token: string): string {
  return [
    `next-auth.session-token=${token}`,
    `__Secure-next-auth.session-token=${token}`,
  ].join('; ');
}

export interface RequestOptions {
  method?: string;
  /** JSON body. Serialised, with `content-type: application/json` set. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Query parameters, merged into the URL. */
  query?: Record<string, string>;
}

const ORIGIN = 'http://localhost:3000';

function buildUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(path.startsWith('http') ? path : `${ORIGIN}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * A `NextRequest` carrying a valid session for `actor`.
 *
 * The route handler is called directly with the returned request, so the whole
 * middleware chain -- `withAuth`, `withEntityScope`, the ownership query --
 * runs exactly as it does in production.
 */
export function requestAs(actor: Actor, path: string, options: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = {
    cookie: cookieHeader(tokenOf(actor)),
    ...options.headers,
  };

  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');

  let body: string | undefined;
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    body = JSON.stringify(options.body);
    headers['content-type'] = headers['content-type'] ?? 'application/json';
  }

  return new NextRequest(buildUrl(path, options.query), { method, headers, body });
}

/**
 * A `NextRequest` with no session cookie.
 *
 * Use it to assert a route returns 401 rather than falling open. A route that
 * answers this with 200 is not authenticating at all -- the failure mode a
 * mocked `getToken` hides completely.
 */
export function anonymousRequest(path: string, options: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = { ...options.headers };
  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');

  let body: string | undefined;
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    body = JSON.stringify(options.body);
    headers['content-type'] = headers['content-type'] ?? 'application/json';
  }

  return new NextRequest(buildUrl(path, options.query), { method, headers, body });
}

/**
 * Read a handler's JSON response body.
 *
 * A convenience, but a load-bearing one: `withEntityScope` distinguishes
 * `ENTITY_REQUIRED` (400), `NOT_FOUND` (404) and `FORBIDDEN` (403) by an error
 * code in the body, and a tenancy test that only checks the status can pass on
 * the wrong refusal.
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
