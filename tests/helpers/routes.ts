/**
 * P-20 (T-035) — the route inventory, read off the filesystem.
 *
 * ============================================================================
 * WHY THIS IS NOT A LIST
 * ============================================================================
 *
 * The audit's cross-tenant leg was proved by roughly 138 refusal cases spread
 * across eleven module suites. Every one of them names its routes by hand. That
 * is the right shape for a module package — it can say what *its* routes should
 * do — and exactly the wrong shape for the platform-level question, because a
 * hand-written list cannot fail for a route nobody wrote a line for. The 149
 * unscoped routes the audit found were not missed by a test that ran and
 * passed; they were missed by tests that were never written.
 *
 * So this module derives the inventory from `src/app/api/**\/route.ts` at test
 * time. A route added tomorrow is in it tomorrow. A route deleted is gone. There
 * is no list to keep in step, and no way for a new file to escape the sweep by
 * not being mentioned.
 *
 * ============================================================================
 * WHAT IT READS, AND WHY COMMENTS ARE STRIPPED FIRST
 * ============================================================================
 *
 * Every classification below is a regex over the route's source with block
 * comments and line comments removed. That is not fastidiousness: this codebase
 * documents the tenancy pattern *inside the route files it does not apply*, so
 * `src/app/api/tasks/route.ts` contains the literal string `withEntityScope`
 * four times in prose. Classifying over raw source would call `onboarding/
 * migration` scoped because its header explains what scoping is. Every route
 * would look correct, which is the failure mode this whole package exists to
 * detect, reproduced in the instrument.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT DO
 * ============================================================================
 *
 * It does not import the route modules. Discovery must work even for a route
 * that throws at import, because "this route cannot be loaded" is itself a
 * finding the sweep has to be able to report rather than crash on.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Repository root, from `tests/helpers/`. */
export const REPO_ROOT = join(__dirname, '..', '..');

/** The directory Next.js turns into the HTTP API surface. */
export const API_ROOT = join(REPO_ROOT, 'src', 'app', 'api');

/** The HTTP verbs Next.js will route to, in the order a sweep should try them. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface RouteInfo {
  /** Absolute path to the route.ts file. */
  file: string;
  /** Path relative to the repo root, POSIX separators. Stable across machines. */
  relFile: string;
  /**
   * The URL pattern, e.g. `/api/workflows/[id]/trigger`. Dynamic segments keep
   * their brackets: substitution is the caller's job, because only the caller
   * knows which id is a real row.
   */
  urlPattern: string;
  /** Dynamic segment names in order, e.g. `['id', 'executionId']`. */
  params: string[];
  /** Exported HTTP handlers, in HTTP_METHODS order. */
  methods: HttpMethod[];
  /** Source with comments removed. Every flag below is computed from this. */
  code: string;

  // -- classification -------------------------------------------------------

  /** Reaches `withAuth` or `withRole` — the request is authenticated. */
  authenticates: boolean;
  /**
   * Reaches any primitive that proves the caller owns the entity it is acting
   * on: the frozen middleware, the P-00b server-side check, or P-10's audited
   * wrappers which compose `withEntityScope` from the inside.
   */
  scopes: boolean;
  /** Mentions `entityId` anywhere in live code. */
  mentionsEntityId: boolean;
  /**
   * The literal anti-pattern from the audit: a session parameter bound and
   * immediately discarded — `withAuth(req, async (req, _session) => ...)`, or a
   * named handler `(_req, _session)`. Not proof of a bug on its own, which is
   * why it is reported beside `scopes` rather than instead of it.
   */
  discardsSession: boolean;
  /**
   * Reads a field off the verified session (`session.userId`, `session.email`,
   * …). A route that does this is scoped to the *user* even when it is not
   * scoped to an entity — `/api/entities` lists what the caller owns — so it is
   * not the audit's defect and must not be reported as one.
   */
  readsSession: boolean;
  /** This is the NextAuth catch-all, which has no session to scope by. */
  isNextAuthCatchAll: boolean;
}

// ---------------------------------------------------------------------------
// Source reading
// ---------------------------------------------------------------------------

/**
 * Remove block comments and line comments.
 *
 * Deliberately naive about `//` inside string literals: the only place that
 * occurs in these files is a URL like `https://...`, and dropping the tail of
 * such a line cannot turn an unscoped route into a scoped one — the failure
 * direction is toward reporting MORE routes as unscoped, never fewer. A
 * classifier whose errors are all in the safe direction is worth more here than
 * a correct tokenizer.
 */
export function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(full);
  }
  return out;
}

function toUrlPattern(file: string): string {
  const rel = relative(API_ROOT, file).split(sep);
  rel.pop(); // drop route.ts
  return '/api' + (rel.length ? '/' + rel.join('/') : '');
}

function paramNames(urlPattern: string): string[] {
  return [...urlPattern.matchAll(/\[(?:\.\.\.)?([^\]]+)\]/g)].map((m) => m[1]);
}

function exportedMethods(code: string): HttpMethod[] {
  return HTTP_METHODS.filter((m) => {
    const patterns = [
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`),
      new RegExp(`export\\s+const\\s+${m}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`),
      new RegExp(`\\bas\\s+${m}\\b`),
    ];
    return patterns.some((p) => p.test(code));
  });
}

/**
 * Anything that proves ownership of the entity being acted on.
 *
 * `withEntityAccess` is included even though the audit found it imported by one
 * route: it performs the same database ownership check, so a route using it is
 * scoped, and calling it unscoped would be a false accusation.
 *
 * `withAuditedEntityScope` and friends (P-10, src/modules/security/audit-wiring)
 * wrap `withEntityScope` from the inside — a route using one is scoped and
 * audited, and the naive regex would miss it because the substring is
 * `EntityScope`, not `withEntityScope`. It matches by construction here; the
 * test in cross-tenant-fuzz.test.ts pins that it does.
 */
export const SCOPE_PRIMITIVES = [
  'withEntityScope',
  'withEntityAccess',
  'verifyEntityForUser',
  'resolveVerifiedEntityId',
  'withAuditedEntityScope',
  'withAuditedRoleEntityScope',
  'entitiesOwnedBy',
];

/** `session.userId`, `session.email`, `authSession.role`, … */
const READS_SESSION =
  /(?<![A-Za-z0-9_.])[A-Za-z]*[sS]ession\s*\.\s*(?:userId|email|name|role|activeEntityId|user\b)/;

/** `withAuth(req, async (r, _session) => …)` or `handleGet(_req, _session)`. */
const DISCARDS_SESSION = /[(,]\s*_(?:session|sess)\b/;

export function classify(file: string): RouteInfo {
  const raw = readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const urlPattern = toUrlPattern(file);

  return {
    file,
    relFile: relative(REPO_ROOT, file).split(sep).join('/'),
    urlPattern,
    params: paramNames(urlPattern),
    methods: exportedMethods(code),
    code,
    authenticates: /\bwithAuth\b|\bwithRole\b|\bwithAudited\w*\b/.test(code),
    scopes: SCOPE_PRIMITIVES.some((p) => new RegExp(`\\b${p}\\b`).test(code)),
    mentionsEntityId: /\bentityId\b/.test(code),
    discardsSession: DISCARDS_SESSION.test(code),
    readsSession: READS_SESSION.test(code),
    isNextAuthCatchAll: /NextAuth\s*\(/.test(code),
  };
}

/** Every API route in the repository, sorted by URL so output is stable. */
export function discoverRoutes(): RouteInfo[] {
  return walk(API_ROOT)
    .map(classify)
    .sort((a, b) => a.urlPattern.localeCompare(b.urlPattern));
}

/**
 * Routes still on the audit's pre-run pattern: authenticate, then throw the
 * session away, and never prove which tenant the caller is.
 *
 * This is the audit's original defect expressed as a query rather than a list.
 * Two clauses, and both are needed:
 *
 *   - `!scopes` — no ownership check of any kind.
 *   - `discardsSession || !readsSession` — the session was verified and then
 *     not used. A route that reads `session.userId` and filters on it IS scoped
 *     (to the user rather than the entity) and is not this defect;
 *     `/api/entities` is the clearest example. `discardsSession` still catches a
 *     file where one handler uses the session and another discards it —
 *     `onboarding/migration` has exactly that shape, POST scoped by userId and
 *     GET not.
 *
 * A route in here is not automatically leaking. `settings/api-keys` reads
 * `process.env` and has no tenant to get wrong; `shadow/config/voice-personas`
 * returns a frozen array. But every route that CAN leak across tenants is in
 * here, so this set is the right thing to hold still and the right thing to
 * shrink. The behavioural sweep in cross-tenant-fuzz.test.ts is what separates
 * the harmless members from the live ones.
 *
 * The NextAuth catch-all is excluded: it is the sign-in endpoint itself and has
 * no session to scope by, by definition.
 */
export function unscopedAuthenticatedRoutes(routes = discoverRoutes()): RouteInfo[] {
  return routes.filter(
    (r) =>
      r.authenticates &&
      !r.scopes &&
      !r.isNextAuthCatchAll &&
      (r.discardsSession || !r.readsSession)
  );
}

/**
 * Fill dynamic segments in a URL pattern.
 *
 * `substitutions` is consulted by parameter name; anything unnamed gets
 * `fallback`. A catch-all (`[...slug]`) is given a single segment, which is
 * enough for a handler to reach its own logic.
 */
export function buildPath(
  urlPattern: string,
  substitutions: Record<string, string> = {},
  fallback = 'p20-nonexistent-id'
): string {
  return urlPattern.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, (_m, name: string) =>
    substitutions[name] ?? fallback
  );
}

/**
 * The `context` argument Next.js passes as a route handler's second parameter.
 *
 * Next 15 made `params` a promise. Handlers here all `await params`, so passing
 * a resolved promise is the production shape rather than a convenience.
 */
export function routeContext(
  route: RouteInfo,
  substitutions: Record<string, string> = {},
  fallback = 'p20-nonexistent-id'
): { params: Promise<Record<string, string>> } {
  const params: Record<string, string> = {};
  for (const name of route.params) {
    params[name] = substitutions[name] ?? fallback;
  }
  return { params: Promise.resolve(params) };
}
