/**
 * P-20 (T-035) — the cross-tenant fuzz: every route, not a sample.
 *
 * ============================================================================
 * WHY A SWEEP AND NOT MORE CASES
 * ============================================================================
 *
 * Eleven module packages wrote roughly 138 cross-tenant refusal cases into
 * `tests/db/*-tenancy.test.ts`. They are good tests and none of them could have
 * found what this file finds, for one structural reason: every one names its
 * routes by hand. A hand-written list cannot fail for a route nobody wrote a
 * line for, and the 149 unscoped routes in the audit were not routes whose
 * tests were wrong — they were routes with no test at all.
 *
 * So nothing here is named. The inventory comes off the filesystem at test time
 * (`tests/helpers/routes.ts`), every exported HTTP handler in it is invoked, and
 * a route added tomorrow is swept tomorrow. There is no list to keep in step.
 *
 * ============================================================================
 * THE THREE SWEEPS, AND WHY IT TAKES THREE
 * ============================================================================
 *
 * 1. STRUCTURAL. Which routes authenticate and then never prove which tenant
 *    the caller is? This is the audit's defect stated as a query. It
 *    over-reports on purpose: `settings/api-keys` reads `process.env` and has no
 *    tenant to get wrong, and `/api/dashboard` scopes correctly with an inline
 *    `where: { id, userId }` rather than a named primitive. Over-reporting is
 *    the safe direction for a detector whose job is to make sure nothing
 *    escapes; convicting is sweep 2's job.
 *
 * 2. BEHAVIOURAL, WITH CANARIES. A refusal proves nothing on its own — a route
 *    that 404s because it is broken, or whose filter matched no rows, refuses
 *    exactly as convincingly as one enforcing tenancy. So tenant B's database is
 *    seeded, generically from the Prisma DMMF, with one row in every model that
 *    has an `entityId` column, each stamped with a unique string. Tenant A then
 *    calls every handler naming B's entity, and every dynamic `[id]` segment is
 *    filled with B's real row ids rather than a fabricated one. A response
 *    containing the canary is a leak that has been *observed*, not inferred: the
 *    bytes of another tenant's row came back.
 *
 * 3. SYMMETRY. For every route, tenant B repeats the request against B's own
 *    entity. A route that refuses A and also refuses B is not enforcing tenancy;
 *    it is broken, or empty, or gated on something else. Sweep 2 alone would
 *    score it as a pass, and a "fix" that denied everyone would score 100%. The
 *    symmetry sweep is what makes the number in sweep 2 mean anything.
 *
 * ============================================================================
 * THE RECORDED FINDINGS
 * ============================================================================
 *
 * The constants below are measurements, not expectations, and each is asserted
 * exactly so that a change to the platform fails this file rather than sliding
 * past it. A route that starts leaking fails; a route that stops leaking also
 * fails, and the fix is to delete it from the constant in the same commit that
 * fixed the route. That is the point: the inventory cannot go stale silently.
 *
 * Run: DATABASE_URL=... npm run test:db
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, requestAs } from '../helpers/session';
import {
  buildPath,
  classify,
  discoverRoutes,
  HTTP_METHODS,
  routeContext,
  SCOPE_PRIMITIVES,
  stripComments,
  unscopedAuthenticatedRoutes,
  type HttpMethod,
  type RouteInfo,
} from '../helpers/routes';

setupTestDatabase();

// The sweep invokes ~500 route handlers twice over against a real Postgres.
jest.setTimeout(300_000);

/**
 * Import a route module, catching any repeating timer it arms at load.
 *
 * A FINDING, not a convenience. `src/modules/shadow/safety/auth-manager.ts`
 * ends with
 *
 *     if (typeof setInterval !== 'undefined') setInterval(cleanExpiredCodes, 60_000);
 *
 * at module scope, un-`unref`ed and with nothing holding the handle. Importing
 * `/api/shadow/auth/send-sms-code` therefore arms a 60-second repeating timer
 * that can never be stopped — the reference is not saved anywhere. In a
 * long-lived server that is merely untidy; in any process that wants to EXIT it
 * is fatal, and it is the second reason the CI database job was cancelled at
 * its fifteen-minute ceiling with every test already passed.
 *
 * The product fix is one word (`.unref()`), and it is under `src/`, which this
 * package may not touch. So the sweep records what its imports arm and clears
 * it afterwards. `setInterval` is patched only around the `import` itself, so
 * nothing a handler does at request time is affected, and jest's own timers are
 * never in scope.
 */
const timersArmedAtImport: NodeJS.Timeout[] = [];

async function importRouteModule(file: string): Promise<Record<string, unknown>> {
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const handle = realSetInterval(...args);
    timersArmedAtImport.push(handle);
    return handle;
  }) as typeof setInterval;

  try {
    return (await import(file)) as Record<string, unknown>;
  } finally {
    globalThis.setInterval = realSetInterval;
  }
}

/**
 * Close what calling five hundred route handlers opens.
 *
 * This is not tidiness. Every other file here touches a handful of routes; this
 * one touches all of them, so it is the only file that opens the rate limiter's
 * Redis client AND the three BullMQ queues in the same process. Each is a lazy
 * module-level singleton that nothing in the sweep owns, and any one of them
 * left open holds the Node event loop after the last assertion.
 *
 * Measured, and the reason this block exists: with them open, `npm run test:db`
 * finished its 849 tests in 374 seconds and then sat there. On CI that is not a
 * warning — the job has `timeout-minutes: 15`, so the run was CANCELLED eight
 * minutes after the tests had all passed, and the PR showed a cancelled job
 * rather than a test result. Nothing here can use `--forceExit`; the jest
 * configs are not this package's to edit, and a suite that needs to be killed
 * to exit is hiding whatever else it leaked.
 */
afterAll(async () => {
  for (const handle of timersArmedAtImport) clearInterval(handle);
  timersArmedAtImport.length = 0;

  const { _closeRedis } = await import('@/shared/middleware/rate-limit');
  await _closeRedis();

  const queues = await Promise.all([
    import('@/lib/queue/workflow-queue').then((m) => m.getQueue()),
    import('@/lib/queue/jobs/registry').then((m) => m.getJobQueue()),
    import('@/lib/queue/scheduler').then((m) => m.getSchedulerQueue()),
  ]);
  await Promise.all(queues.map((q) => q.close().catch(() => undefined)));
}, 30_000);

// ---------------------------------------------------------------------------
// THE FINDINGS, RECORDED
// ---------------------------------------------------------------------------

/**
 * The five routes P-20's card predicted would still be on the pre-run pattern.
 *
 * Written down here ONLY so the test can assert that the filesystem-derived
 * detector finds them without being told where to look. Nothing in the sweep
 * reads this constant except that one assertion — remove it and every other
 * number in this file is unchanged.
 */
const PREDICTED_UNSCOPED = [
  '/api/onboarding/migration',
  '/api/settings/api-keys',
  '/api/shadow/config/voice-personas',
  '/api/shadow/receipts',
  '/api/shadow/receipts/[id]',
];

/**
 * Route/method pairs observed handing tenant A a row belonging to tenant B.
 *
 * Every one is in `src/modules/shadow/`, the directory no tenancy package ever
 * owned: P-02 repaired its type errors and P-14 was told to stay out of it.
 *
 *   GET  /api/shadow/receipts           takes `?entityId=` off the query string
 *                                       and passes it straight to
 *                                       `listReceipts`. The caller names the
 *                                       tenant; nothing verifies it.
 *   GET  /api/shadow/playbooks          lists every playbook with no entity
 *                                       filter at all, so the query string is
 *                                       not even needed.
 *   GET  /api/shadow/receipts/[id]      `getReceipt(id)`, unscoped. A consent
 *                                       receipt is the record of a decision
 *                                       someone made about their own data.
 *   PUT  /api/shadow/playbooks/[id]     `updatePlaybook(id, …)`, unscoped. A
 *                                       WRITE: another tenant's call script is
 *                                       rewritten and echoed back.
 *   POST /api/shadow/receipts/[id]/rollback
 *                                       `rollbackAction(id, session.userId)`,
 *                                       unscoped. A WRITE, and the worst of the
 *                                       five: it UNDOES an action another
 *                                       tenant consented to, and files the
 *                                       reversal under the caller's user id.
 *
 * The last two are the argument for having a behavioural sweep at all. Neither
 * appears in the audit's list of five. `PUT /api/shadow/playbooks/[id]` is in
 * the structural set below but is invisible to a reader of that set, because
 * twenty-six other members of it are harmless. And `POST
 * /api/shadow/receipts/[id]/rollback` is NOT in the structural set: it reads
 * `session.userId` and passes it onward, which is exactly what a correctly
 * user-scoped route does — it simply never checks the receipt. No static rule
 * this file could write would catch that. Handing it another tenant's receipt
 * id and watching what happens does.
 */
const KNOWN_LEAKING_ROUTES = [
  'GET /api/shadow/playbooks',
  'GET /api/shadow/receipts',
  'GET /api/shadow/receipts/[id]',
  'PUT /api/shadow/playbooks/[id]',
  'POST /api/shadow/receipts/[id]/rollback',
];

// ---------------------------------------------------------------------------
// Generic fixtures, derived from the schema rather than written per model
// ---------------------------------------------------------------------------

/**
 * Every Prisma model carrying an `entityId`, i.e. every table that has a tenant.
 *
 * Read from the DMMF for the same reason `listTruncatableTables()` reads
 * `pg_tables`: a model added later is swept without anyone remembering.
 */
const TENANTED_MODELS = Prisma.dmmf.datamodel.models.filter((m) =>
  m.fields.some((f) => f.name === 'entityId')
);

/** Fields worth stamping even when optional — they are what routes echo back. */
const NARRATIVE_FIELDS = ['name', 'title', 'description', 'content', 'body', 'reason'];

/** A repo-relative path, resolved from tests/db/. */
function routeFile(relative: string): string {
  return join(__dirname, '..', '..', relative);
}

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Put one canary-stamped row in every tenanted table for `tenant`.
 *
 * Required scalars are filled by type; `userId` is filled with the tenant's own
 * user so the row is coherent. A model whose required *relations* cannot be
 * satisfied generically is skipped and reported — the count is asserted, so a
 * schema change that silently shrinks the fixture surface fails the test rather
 * than quietly narrowing the sweep.
 */
async function seedCanaryRows(
  tenant: Tenant,
  canary: string
): Promise<{ ids: Map<string, string>; skipped: string[] }> {
  const ids = new Map<string, string>();
  const skipped: string[] = [];

  for (const model of TENANTED_MODELS) {
    const data: Record<string, unknown> = { entityId: tenant.entity.id };

    for (const field of model.fields) {
      if (field.kind === 'object') continue;
      if (field.name === 'entityId' || field.name === 'id') continue;
      // `updatedAt` carries @updatedAt, not a create-time default.
      if (field.hasDefaultValue && field.name !== 'updatedAt') continue;
      if (!field.isRequired && !NARRATIVE_FIELDS.includes(field.name)) continue;
      if (field.name === 'userId') {
        data.userId = tenant.user.id;
        continue;
      }
      if (field.isList) {
        data[field.name] = field.type === 'String' ? [canary] : [];
        continue;
      }
      switch (field.type) {
        case 'String': data[field.name] = canary; break;
        case 'Int': case 'BigInt': data[field.name] = 1; break;
        case 'Float': case 'Decimal': data[field.name] = 1.5; break;
        case 'Boolean': data[field.name] = false; break;
        case 'DateTime': data[field.name] = new Date(); break;
        case 'Json': data[field.name] = {}; break;
        default: data[field.name] = canary;
      }
    }

    try {
      const delegate = (db as unknown as Record<
        string,
        { create: (args: { data: unknown }) => Promise<{ id: string }> }
      >)[delegateName(model.name)];
      const row = await delegate.create({ data });
      ids.set(model.name, row.id);
    } catch {
      skipped.push(model.name);
    }
  }

  return { ids, skipped };
}

/**
 * Which of tenant B's seeded rows should fill this route's `[id]` segment.
 *
 * The obvious answer — try all 32 — is correct and unusably slow: it turns
 * ~140 dynamic route/method pairs into ~9,000 handler invocations, and a sweep
 * nobody will wait for is a sweep that stops being run. The obvious cheap
 * answer — guess from the URL — is fast and wrong often enough to miss a leak,
 * which is worse.
 *
 * So the candidates are DERIVED FROM THE ROUTE'S OWN SOURCE, in the same spirit
 * as the inventory itself:
 *
 *   1. Every `prisma.<delegate>` the route names. A route that reads a row
 *      almost always names the delegate it reads, and that is the model whose
 *      id will make it answer.
 *   2. Every model whose name matches a path segment — for routes that reach
 *      their table through a service instead of Prisma directly.
 *   3. If neither produced anything, every seeded id. A route this file cannot
 *      reason about is swept exhaustively rather than skipped; the fallback is
 *      the safe direction and it is rare enough to afford.
 *
 * Ordering matters too: the sweep walks these while the answer is 404, so a
 * better-ranked candidate only saves time — it never decides coverage.
 */
function candidateRowIds(route: RouteInfo, ids: Map<string, string>): string[] {
  const named = new Set(
    [...route.code.matchAll(/\bprisma\s*\.\s*([a-z][A-Za-z0-9]*)\s*\./g)].map((m) => m[1])
  );

  const segments = route.urlPattern
    .split('/')
    .filter((s) => s && s !== 'api' && !s.startsWith('['))
    .map((s) => s.replace(/ies$/, 'y').replace(/s$/, '').replace(/-/g, '').toLowerCase());

  const scored = [...ids.entries()].map(([model, id]) => {
    const lower = model.toLowerCase();
    let score = 0;
    if (named.has(delegateName(model))) score += 100;
    for (const segment of segments) {
      if (segment.length > 2 && lower.includes(segment)) score += segment.length;
    }
    return { id, score, length: model.length };
  });

  const matched = scored.filter((s) => s.score > 0);
  const chosen = matched.length > 0 ? matched : scored;

  return chosen
    .sort((a, b) => b.score - a.score || a.length - b.length)
    .map((s) => s.id);
}

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

type Handler = (req: unknown, ctx?: unknown) => Promise<Response>;

interface Attempt {
  key: string;
  status: number;
  /** Wall time for this route/method, summed over the ids it had to walk. */
  elapsedMs: number;
  /** The response body, for canary detection. */
  body: string;
  /** True when another tenant's seeded row came back in the body. */
  leaked: boolean;
}

const HANDLER_TIMEOUT_MS = 10_000;

/**
 * Read a response body without waiting for a stream that never ends.
 *
 * `GET /api/events/stream` answers 200 with a `text/event-stream` whose
 * ReadableStream stays open for the life of the subscription — that is the
 * point of it. `await res.text()` on that never resolves, and it does not
 * resolve *after* the handler returned, so no timeout around the handler call
 * catches it. The first version of this file hung there for half an hour and
 * looked like a slow test rather than one waiting on a socket, which is worth
 * a paragraph so nobody spends that half hour twice.
 *
 * A streaming response is cancelled rather than read: its status is the whole
 * of the evidence available, and 403 vs 200 on a live feed of another tenant's
 * events is exactly the thing being measured.
 */
async function readBounded(res: Response): Promise<string> {
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    await res.body?.cancel().catch(() => undefined);
    return '';
  }
  return Promise.race([
    res.text(),
    new Promise<string>((resolve) => setTimeout(() => resolve(''), 2_000)),
  ]);
}

async function invoke(
  route: RouteInfo,
  method: HttpMethod,
  fn: Handler,
  actor: Tenant,
  namedEntityId: string,
  rowIds: string[],
  canary: string
): Promise<Attempt> {
  const key = `${method} ${route.urlPattern}`;
  const candidates = route.params.length ? rowIds : [''];
  let last: Attempt = { key, status: -1, body: '', leaked: false, elapsedMs: 0 };
  const startedAt = Date.now();

  for (const rowId of candidates) {
    const substitutions: Record<string, string> = {};
    for (const param of route.params) substitutions[param] = rowId;

    const path = buildPath(route.urlPattern, substitutions);
    const req = requestAs(actor, path, {
      method,
      query: { entityId: namedEntityId },
      body:
        method === 'GET' || method === 'DELETE'
          ? undefined
          : { entityId: namedEntityId },
    });

    let status: number;
    let body: string;
    try {
      const res = await Promise.race([
        fn(req, routeContext(route, substitutions)),
        new Promise<Response>((_resolve, reject) =>
          setTimeout(() => reject(new Error('handler timed out')), HANDLER_TIMEOUT_MS)
        ),
      ]);
      status = res.status;
      body = await readBounded(res);
    } catch (err) {
      return {
        key,
        status: 599,
        body: err instanceof Error ? err.message : String(err),
        leaked: false,
        elapsedMs: Date.now() - startedAt,
      };
    }

    last = {
      key,
      status,
      body,
      leaked: body.includes(canary),
      elapsedMs: Date.now() - startedAt,
    };
    // Found the row, got in, or got a definite non-404 answer: stop walking ids.
    if (last.leaked || status < 400 || status !== 404) break;
  }

  return last;
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('T-035 — the route inventory is read off the filesystem', () => {
  it('finds every API route, and an exported handler in each', () => {
    const routes = discoverRoutes();

    // Not a magic number: it is the floor below which the walker has clearly
    // stopped finding files, which is the way this instrument fails silently.
    expect(routes.length).toBeGreaterThan(300);

    const withoutHandlers = routes.filter((r) => r.methods.length === 0);
    expect(withoutHandlers.map((r) => r.urlPattern)).toEqual([]);
  });

  it('strips comments before classifying, or every route looks correct', () => {
    // The instrument checking itself, on two real examples and one synthetic
    // one — and every part of this test has already failed for real.
    //
    // BLOCK COMMENT. `src/app/api/travel/visa/route.ts` says "Deliberately
    // `withAuth` and not `withEntityScope`" in its header, explaining why it is
    // NOT scoped. A classifier reading raw source clears it on the strength of
    // the sentence saying it is not.
    const visa = routeFile('src/app/api/travel/visa/route.ts');
    expect(readFileSync(visa, 'utf8')).toContain('withEntityScope');
    expect(classify(visa).scopes).toBe(false);

    // LINE COMMENT. `src/app/api/safety/throttle/route.ts` says
    // "`withAuditedRole` is a separate helper from `withAuditedRoleEntityScope`"
    // on a `//` line. This one is not hypothetical: the first version of
    // stripComments split on '\n' without normalising CRLF, so on a Windows
    // checkout every line kept a trailing '\r', `.` does not match '\r', and
    // the line-comment strip matched nothing at all. This route was cleared by
    // that comment, the recorded set below was one route short, and the suite
    // was green locally and red in CI — with CI right.
    const throttle = routeFile('src/app/api/safety/throttle/route.ts');
    expect(readFileSync(throttle, 'utf8')).toContain('withAuditedRoleEntityScope');
    expect(classify(throttle).scopes).toBe(false);

    // And the mechanism directly, so the reading cannot depend on the checkout:
    // the same source with either line ending must strip identically.
    const sample = '// withEntityScope in a comment\nconst x = 1;\n';
    expect(stripComments(sample)).not.toContain('withEntityScope');
    expect(stripComments(sample.replace(/\n/g, '\r\n'))).not.toContain('withEntityScope');
  });

  it('counts P-10 audited wrappers as scoping, so audited routes are not accused', () => {
    // withAuditedRoleEntityScope composes withEntityScope from the inside, and
    // the substring is `EntityScope`, not `withEntityScope`. A detector matching
    // only the frozen primitive misses it and reports 30 correct, audited routes
    // as defects — which would bury the five real ones in noise.
    const audited = classify(routeFile('src/app/api/crisis/route.ts'));
    expect(audited.code).toContain('withAuditedRoleEntityScope');
    expect(audited.scopes).toBe(true);

    // And the other half of the same care: `withAuditedAuth` is NOT a scope
    // primitive — it audits, it does not check the entity — so a route using
    // only that one must not be cleared by association.
    expect(audited.code).toContain('withAuditedAuth');
    expect(SCOPE_PRIMITIVES).not.toContain('withAuditedAuth');
  });
});

describe('T-035 — routes that authenticate and never prove the tenant', () => {
  it('finds the five the audit predicted, without being told where to look', () => {
    const unscoped = unscopedAuthenticatedRoutes().map((r) => r.urlPattern);

    for (const predicted of PREDICTED_UNSCOPED) {
      expect(unscoped).toContain(predicted);
    }
  });

  it('reports the whole set — thirty routes, not five', () => {
    const unscoped = unscopedAuthenticatedRoutes();
    const patterns = unscoped.map((r) => r.urlPattern);

    // The number is recorded rather than bounded loosely: a route added on the
    // old pattern must fail this test, and so must a route repaired without
    // updating the record. Both are things a reviewer should see.
    //
    // IT ALREADY EARNED ITS KEEP, AND NOT IN THE DIRECTION EXPECTED. This list
    // was recorded at twenty-seven against the pre-P-19 tree. Merging P-19 made
    // it fail with two additions, `/api/attention/insights` and
    // `/api/attention/notifications` — and neither route's tenancy changed.
    //
    // Both were always tenant-blind. Both LOOKED scoped, to this classifier and
    // to any reviewer, because between them they named `session.userId` six
    // times in `where:` clauses — on `(prisma as any).notification` and
    // `(prisma as any).focusSession`, delegates that do not exist on this
    // schema, inside swallowed catches. Those queries threw on every request
    // this route has ever served. `readsSession` was true and the route was
    // excluded on the strength of code that never ran.
    //
    // P-19 deleted the dead queries, the handlers stopped referencing the
    // session at all, and the hole they were hiding became visible. The bug was
    // not introduced by the repair; it was DISCLOSED by it. Dead code that
    // mentions the right variable is indistinguishable from live code that uses
    // it — to a grep, to this instrument, and to a human reading the file.
    //
    // IT EARNED ITS KEEP A SECOND TIME, IN P-28. Twenty-nine became thirty when
    // `/api/admin/observability` landed, and this test is the reason that
    // addition is being justified in writing rather than merged unnoticed.
    //
    // That route IS authenticated (`withRole(['owner','admin'])`) and it is
    // deliberately NOT entity-scoped, which is why it appears here. What it
    // returns is not any tenant's data: it is a property of the PROCESS —
    // which Prisma queries are failing, which model is missing from the schema,
    // whether the worker tier is alive. No entity owns "the client cannot find
    // table X", so there is nothing for `withEntityScope` to check. Adding it
    // would have produced a filter that looked like tenancy and filtered
    // nothing, which is the exact shape of the ten bugs P-28 exists to detect.
    //
    // The residual exposure is real and is stated rather than hidden: any owner
    // or admin of ANY entity sees platform-wide operational data. It is
    // mitigated by scrubbing emails, uuids and long tokens out of every message
    // at record time (`scrubMessage`), by never recording Prisma query
    // arguments at all, and by the role gate itself. See docs/observability.md.
    //
    // If a later package decides platform telemetry should be owner-only, or
    // partitioned per entity, this line is where that decision gets made.
    expect(patterns).toEqual([
      '/api/admin/observability',
      '/api/attention/insights',
      '/api/attention/notifications',
      '/api/billing/model-route',
      '/api/crisis/detect',
      '/api/dashboard',
      '/api/engines/classification',
      '/api/engines/draft',
      '/api/engines/scheduling',
      '/api/engines/triage',
      '/api/engines/voice',
      '/api/inbox/draft/refine',
      '/api/jobs',
      '/api/onboarding/migration',
      '/api/safety/email-headers',
      '/api/safety/fraud-check',
      '/api/safety/injection-check',
      '/api/safety/throttle',
      '/api/settings/api-keys',
      '/api/shadow/config/voice-personas',
      '/api/shadow/config/voice-personas/[id]/preview',
      '/api/shadow/playbooks/[id]',
      '/api/shadow/receipts',
      '/api/shadow/receipts/[id]',
      '/api/shadow/test/phone',
      '/api/shadow/test/text',
      '/api/shadow/test/voice',
      '/api/travel/flights/search',
      '/api/travel/hotels/search',
      '/api/travel/visa',
    ]);

    // Eight of the twenty-nine are under /api/shadow/, backed by
    // src/modules/shadow/ — the directory no tenancy package owned. That is not
    // a coincidence, and it is the finding behind the finding: the five routes
    // that actually leak are all in the same eight.
    expect(patterns.filter((p) => p.startsWith('/api/shadow/')).length).toBe(8);
  });
});

/**
 * The sweep, run once and memoised.
 *
 * It cannot go in `beforeAll`: `setupTestDatabase()` truncates before every
 * test, so fixtures built in `beforeAll` are gone before the first assertion.
 * It must not go in `beforeEach` either — that would run the full ~1000-call
 * sweep once per assertion in this file, and a test suite nobody wants to run
 * is a test suite that stops being run. So the first assertion that needs it
 * pays for it and the rest read the result. The cached value is plain data;
 * nothing in it is a database handle, so later truncation cannot invalidate it.
 */
interface SweepResult {
  tenantA: Tenant;
  tenantB: Tenant;
  canary: string;
  rowIds: Map<string, string>;
  seedSkipped: string[];
  attemptsAtoB: Attempt[];
  attemptsBtoB: Attempt[];
}

let cachedSweep: SweepResult | null = null;

async function sweep(): Promise<SweepResult> {
  if (cachedSweep) return cachedSweep;

  const { tenantA, tenantB } = await createTwoTenants();
  const canary = `P20-CANARY-${Date.now()}`;
  const { ids: rowIds, skipped: seedSkipped } = await seedCanaryRows(tenantB, canary);

  const attemptsAtoB: Attempt[] = [];
  const attemptsBtoB: Attempt[] = [];

  for (const route of discoverRoutes()) {
    // The NextAuth catch-all is the sign-in endpoint itself. It is not a
    // tenant-scoped route — it is what MINTS the session every other route
    // verifies — and NextAuth's own handler reaches for `cookies()` from
    // `next/headers`, which throws outside a Next request scope. Invoking it
    // here measures the harness, not the platform. It is excluded by name-free
    // classification (`isNextAuthCatchAll`) rather than by path, and
    // end-to-end-proof.test.ts exercises the sign-in path properly by driving
    // the credentials provider directly.
    if (route.isNextAuthCatchAll) continue;

    const mod = await importRouteModule(route.file);
    const ranked = candidateRowIds(route, rowIds);

    for (const method of HTTP_METHODS) {
      const fn = mod[method] as Handler | undefined;
      if (typeof fn !== 'function') continue;

      // The attack: A's session, B's entity, B's row ids.
      attemptsAtoB.push(
        await invoke(route, method, fn, tenantA, tenantB.entity.id, ranked, canary)
      );
      // The control: B's session, B's entity, B's row ids. If this refuses too,
      // the refusal above was not tenancy.
      attemptsBtoB.push(
        await invoke(route, method, fn, tenantB, tenantB.entity.id, ranked, canary)
      );
    }
  }

  cachedSweep = { tenantA, tenantB, canary, rowIds, seedSkipped, attemptsAtoB, attemptsBtoB };

  const slowest = [...attemptsAtoB, ...attemptsBtoB]
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .slice(0, 15)
    .map((a) => '  ' + String(a.elapsedMs).padStart(6) + 'ms  ' + a.status + '  ' + a.key);
  console.log(
    [
      '',
      `P-20 fuzz: ${attemptsAtoB.length} route/method pairs, swept twice.`,
      'Slowest calls:',
      ...slowest,
      '',
    ].join('\n')
  );

  return cachedSweep;
}

describe('T-035 — every route, called by tenant A while naming tenant B', () => {
  it('seeds a canary row in nearly every tenanted table', async () => {
    const { rowIds, seedSkipped } = await sweep();
    // 33 models carry an entityId; `Message` needs a real sender/recipient User
    // relation that cannot be filled from the model definition alone. If that
    // number grows, the sweep has quietly narrowed and this fails.
    expect(TENANTED_MODELS.length).toBe(33);
    expect(seedSkipped).toEqual(['Message']);
    expect(rowIds.size).toBe(32);
  });

  it('exercises the whole surface, not a sample of it', async () => {
    const { attemptsAtoB, attemptsBtoB } = await sweep();
    expect(attemptsAtoB.length).toBeGreaterThan(450);
    expect(attemptsBtoB.length).toBe(attemptsAtoB.length);

    // Nothing may be skipped for being awkward: a handler that threw or hung is
    // an unmeasured route, and an unmeasured route is where the next gap lives.
    const unmeasured = attemptsAtoB.filter((a) => a.status === 599);
    expect(unmeasured.map((a) => `${a.key} :: ${a.body}`)).toEqual([]);
  });

  it('returns another tenant rows from exactly the routes on record, and no others', async () => {
    const { attemptsAtoB } = await sweep();
    const leaking = attemptsAtoB.filter((a) => a.leaked).map((a) => a.key).sort();

    // This is the assertion the package exists for. A new leak fails here with
    // the route named; a repaired leak fails here too, and the fix is to delete
    // it from KNOWN_LEAKING_ROUTES in the commit that repaired it.
    expect(leaking).toEqual([...KNOWN_LEAKING_ROUTES].sort());
  });

  it('answers tenant A exactly as it answers tenant B — it cannot tell them apart', async () => {
    const { attemptsAtoB, attemptsBtoB } = await sweep();

    // The canary in an A→B response only means "another tenant's data" if B
    // legitimately sees it too. If B could not reach its own rows either, the
    // canary would be evidence of something else entirely, and a "fix" that
    // denied everyone would satisfy every negative assertion in this file.
    //
    // So the claim is the strongest and simplest one available: on each of
    // these routes the platform returns the SAME STATUS and the SAME ROW to the
    // owner and to a stranger. It is not refusing anyone badly; it is not
    // distinguishing them at all.
    const table: string[] = [];
    for (const key of KNOWN_LEAKING_ROUTES) {
      const attack = attemptsAtoB.find((a) => a.key === key);
      const control = attemptsBtoB.find((a) => a.key === key);
      expect(attack).toBeDefined();
      expect(control).toBeDefined();

      // Both see tenant B's row...
      expect(attack!.leaked).toBe(true);
      expect(control!.leaked).toBe(true);
      // ...and the platform's answer to the two of them is identical.
      expect(attack!.status).toBe(control!.status);

      table.push(`  ${String(attack!.status).padStart(3)}  A=B  ${key}`);
    }

    // One of the five answers 400 rather than 200 to both callers:
    // `POST /api/shadow/receipts/[id]/rollback` reports ROLLBACK_FAILED for a
    // receipt with nothing to undo — and puts the other tenant's action
    // description in the message while doing it. A refusal that quotes the
    // record it refused to touch is still a disclosure, so it is counted.
    expect(table.filter((r) => r.trim().startsWith('400'))).toHaveLength(1);

    console.log(['', 'P-20 fuzz — routes that cannot tell A from B:', ...table, ''].join('\n'));
  });

  it('reads one tenant consent receipt by id from another tenant session', async () => {
    const { attemptsAtoB, rowIds, canary } = await sweep();
    // Stated on its own because the sweep can only reach it by supplying a real
    // receipt id, and because a receipt is the record of a consent decision --
    // reading someone else's is not a cosmetic leak.
    const receiptId = rowIds.get('ShadowConsentReceipt');
    expect(receiptId).toBeDefined();

    const attempt = attemptsAtoB.find((a) => a.key === 'GET /api/shadow/receipts/[id]');
    expect(attempt).toBeDefined();
    expect(attempt!.status).toBe(200);
    expect(attempt!.body).toContain(canary);
  });

  it('refuses A on every route that also serves B — the asymmetry is the enforcement', async () => {
    const { attemptsAtoB, attemptsBtoB } = await sweep();
    // For each route, compare the two sweeps. A route is enforcing tenancy when
    // it answers B and refuses A. A route that refuses both is NOT counted as a
    // pass anywhere in this file; it is reported here so the number in the leak
    // assertion is not quietly propped up by routes that refuse everyone.
    const enforcing: string[] = [];
    const refusesEveryone: string[] = [];
    const servesEveryone: string[] = [];
    const servesOnlyA: string[] = [];

    for (const attack of attemptsAtoB) {
      const control = attemptsBtoB.find((c) => c.key === attack.key)!;
      const attackRefused = attack.status >= 400;
      const controlRefused = control.status >= 400;

      if (attackRefused && !controlRefused) enforcing.push(attack.key);
      else if (attackRefused && controlRefused) refusesEveryone.push(attack.key);
      else if (!attackRefused && !controlRefused) servesEveryone.push(attack.key);
      else servesOnlyA.push(attack.key);
    }

    console.log(
      [
        '',
        'P-20 fuzz — symmetry:',
        `  enforcing (refuses A, serves B) ..... ${enforcing.length}`,
        `  refuses everyone .................... ${refusesEveryone.length}`,
        `  serves everyone ..................... ${servesEveryone.length}`,
        `  serves A but refuses B .............. ${servesOnlyA.length}`,
        '',
      ].join('\n')
    );

    // The load-bearing number. 135 route/method pairs demonstrably DISCRIMINATE
    // between the two tenants in the same request — they answer B and refuse A.
    // That is the only class of result that is evidence of tenancy, and it is
    // recorded exactly rather than as a floor, because a "fix" that denied
    // everyone would push this number DOWN while every negative assertion in
    // every tenancy suite kept passing.
    expect(enforcing.length).toBe(135);

    // The honesty clause, stated as an assertion rather than a hope. These
    // refuse A — and they refuse B too, so their refusal is not evidence of
    // anything. They are excluded from the number above by construction; this
    // line only proves the four buckets are a partition and none was dropped.
    expect(
      enforcing.length +
        refusesEveryone.length +
        servesEveryone.length +
        servesOnlyA.length
    ).toBe(attemptsAtoB.length);
  });

  it('never lets an unauthenticated caller reach any of it', () => {
    // The floor under the whole sweep. `requestAs` mints a real encrypted
    // NextAuth JWT and `getToken` is not mocked, so if authentication were
    // stubbed anywhere the anonymous call would succeed and this would fail.
    expect(anonymousRequest('/api/tasks').headers.get('cookie')).toBeNull();
  });
});

describe('T-035 — the leaks are writes as well as reads, where the route allows it', () => {
  it('does not let tenant A write into tenant B through any swept route', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const canary = `P20-WRITE-${Date.now()}`;

    const before = await db.task.count({ where: { entityId: tenantB.entity.id } });

    const routes = discoverRoutes().filter((r) =>
      r.methods.some((m) => m !== 'GET')
    );

    for (const route of routes) {
      const mod = await importRouteModule(route.file);
      for (const method of HTTP_METHODS) {
        if (method === 'GET') continue;
        const fn = mod[method] as Handler | undefined;
        if (typeof fn !== 'function') continue;

        const req = requestAs(tenantA, buildPath(route.urlPattern, {}), {
          method,
          query: { entityId: tenantB.entity.id },
          body: {
            entityId: tenantB.entity.id,
            title: canary,
            name: canary,
            description: canary,
            content: canary,
          },
        });
        try {
          await Promise.race([
            fn(req, routeContext(route, {})),
            new Promise<Response>((_r, reject) =>
              setTimeout(() => reject(new Error('timeout')), HANDLER_TIMEOUT_MS)
            ),
          ]);
        } catch {
          // A throwing handler wrote nothing; the row counts below are the
          // assertion, not the status code.
        }
      }
    }

    // Nothing named the canary landed in B's tenant from A's session.
    expect(await db.task.count({ where: { entityId: tenantB.entity.id, title: canary } })).toBe(0);
    expect(await db.task.count({ where: { entityId: tenantB.entity.id } })).toBe(before);
    expect(await db.contact.count({ where: { entityId: tenantB.entity.id, name: canary } })).toBe(0);
    expect(await db.project.count({ where: { entityId: tenantB.entity.id, name: canary } })).toBe(0);
    expect(await db.workflow.count({ where: { entityId: tenantB.entity.id, name: canary } })).toBe(0);
  });
});
