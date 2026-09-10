// ============================================================================
// P-29 — RE-MINTING THE SESSION COOKIE SERVER-SIDE
//
// WHY THIS FILE EXISTS
//
// `session: { strategy: 'jwt' }`. There is no session row: the only place the
// active entity lives is the encrypted `next-auth.session-token` cookie the
// browser holds. `token.activeEntityId` was written in exactly one place --
// `src/lib/auth/config.ts`, inside `if (user)`, which runs only at initial
// sign-in -- and set to `entities[0]` ordered by `createdAt asc`.
//
// So `POST /api/auth/switch-entity` could verify ownership, return
// `{ activeEntityId }`, and change nothing at all. It did. A 200, a plausible
// value, and nothing happened. See
// `docs/parallel-build/decision-01-entity-isolation.md`.
//
// The fix is the one thing that actually moves the value: mint a new token with
// the new claim and set it on the response. `tests/helpers/session.ts` had
// already proved this is possible -- it mints exactly the token NextAuth would
// issue using the same `encode` -- so a switch needs no migration and no
// session table.
//
// WHY NOT THE `trigger === 'update'` CALLBACK PATH
//
// NextAuth v4's other route is to grow the `jwt` callback a
// `trigger === 'update'` branch and have the client call
// `update({ activeEntityId })`. It is idiomatic, and it is the wrong shape
// here for two reasons:
//
//   1. The value would arrive FROM THE CLIENT. A token is a capability; the
//      ownership check would have to move into the callback, which runs on
//      every session read, and a callback that forgets it silently hands out
//      whatever the browser asked for. Here ownership is checked in the route,
//      against the database, before this function is ever called, and this
//      function's only input is a value the route already proved.
//   2. It only works for `next-auth/react`. A CLI, a mobile client or a server
//      integration calling `POST /api/auth/switch-entity` would still get the
//      no-op. The cookie path works for every caller because the server, not
//      the client library, decides.
//
// WHAT IS DELIBERATELY PRESERVED
//
//   * Every other claim. The new token is the old token with one field
//     replaced -- `userId`, `role`, `email`, `name`, `sub`, `picture` and
//     anything a future package adds all survive, because they are spread
//     rather than re-listed.
//   * The expiry. Switching your acting context is not a reason to extend your
//     session, so the new token carries the old token's REMAINING lifetime, not
//     a fresh 30 days. NextAuth's own `/api/auth/session` still rolls the
//     session on its normal schedule; this just declines to do it here.
//
// The cookie name, `httpOnly`/`sameSite`/`path`/`secure` and the secure-cookie
// decision mirror NextAuth v4.24's own defaults exactly (`next-auth/jwt`
// `getToken`, and `defaultCookies` in `next-auth/core/lib/cookie`). If they did
// not, `getToken` would look for a cookie this file never set and the switch
// would silently do nothing -- the same failure, one layer down.
// ============================================================================

import type { NextRequest, NextResponse } from 'next/server';
import { encode, getToken, type JWT } from 'next-auth/jwt';

const PLAIN_SESSION_COOKIE = 'next-auth.session-token';
const SECURE_SESSION_COOKIE = '__Secure-next-auth.session-token';

/** Mirrors `authOptions.session.maxAge`. Seconds. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The secure-cookie decision, byte-for-byte as `getToken` makes it.
 *
 * Note the `??`: an explicitly http `NEXTAUTH_URL` yields `false` and `VERCEL`
 * is NOT consulted, because `startsWith` returned a boolean rather than
 * `undefined`. Reproducing that quirk matters more than improving on it -- the
 * reader and the writer must choose the same cookie.
 */
export function secureSessionCookieEnabled(): boolean {
  return process.env.NEXTAUTH_URL?.startsWith('https://') ?? !!process.env.VERCEL;
}

/** The cookie `getToken` will read on the next request. Resolved at call time. */
export function sessionCookieName(): string {
  return secureSessionCookieEnabled() ? SECURE_SESSION_COOKIE : PLAIN_SESSION_COOKIE;
}

/**
 * Seconds left on `token`, or the configured maximum when it carries no `exp`.
 *
 * `JWT` is `Record<string, unknown>`, so `exp` arrives untyped and is narrowed
 * rather than asserted -- `as any` is not available here and is not wanted.
 */
function remainingLifetimeSeconds(token: JWT): number {
  const exp = token.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return SESSION_MAX_AGE_SECONDS;
  const remaining = Math.floor(exp - Date.now() / 1000);
  // `decode` allows 15s of clock skew, so a token can verify with `exp` a
  // moment in the past. Never mint a token that is born expired.
  return Math.max(remaining, 1);
}

/** The claims this module is allowed to change. Widen deliberately, never by accident. */
export type SessionClaimChanges = Partial<Pick<JWT, 'activeEntityId'>>;

/**
 * Replace the caller's session cookie on `res` with one carrying `changes`.
 *
 * `req` supplies the current token: this reads it back through the production
 * `getToken`, so a caller cannot smuggle claims in, and a request whose cookie
 * does not decrypt gets `false` rather than a freshly minted session.
 *
 * Returns `false` when nothing was set. A caller that ignores that has rebuilt
 * the bug this file exists to fix, so callers must fail the request instead.
 */
export async function remintSessionCookie(
  req: NextRequest,
  res: NextResponse,
  changes: SessionClaimChanges
): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error('[auth] NEXTAUTH_SECRET is unset; cannot re-mint the session token');
    return false;
  }

  let current: JWT | null;
  try {
    current = await getToken({ req, secret });
  } catch {
    return false;
  }
  if (!current) return false;

  const maxAge = remainingLifetimeSeconds(current);

  // `encode` sets `iat`, `exp` and `jti` itself; carrying the old ones through
  // would be harmless but misleading, so they are dropped explicitly.
  const { exp: _exp, iat: _iat, jti: _jti, ...claims } = current;

  let token: string;
  try {
    token = await encode({ token: { ...claims, ...changes }, secret, maxAge });
  } catch (err) {
    console.error('[auth] failed to encode the re-minted session token', err);
    return false;
  }

  const name = sessionCookieName();
  const secure = secureSessionCookieEnabled();

  res.cookies.set({
    name,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge,
  });

  // NextAuth splits a token over `<name>.0`, `<name>.1`, ... when it exceeds
  // 4096 bytes, and `SessionStore` reassembles ANY chunks it finds. These
  // tokens are a few hundred bytes so chunking should never occur, but if a
  // chunked cookie ever did survive alongside the one just set, the reader
  // would concatenate the two and decrypt neither -- a silent logout. Expire
  // any chunk the request presented.
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith(`${name}.`)) {
      res.cookies.set({
        name: cookie.name,
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure,
        maxAge: 0,
      });
    }
  }

  return true;
}
