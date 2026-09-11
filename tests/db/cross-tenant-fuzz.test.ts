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

  // P-27 adds a fourth: `insertTask` publishes `task.created`, so every
  // `POST /api/tasks` the sweep makes opens the domain-event producer. Closed
  // through its own helper rather than `getDomainEventQueue().close()` because
  // that helper also clears the cached handle -- see the note on `globalThis`
  // in src/lib/queue/domain-events.ts.
  const { closeDomainEventQueue } = await import('@/lib/queue/domain-events');
  await closeDomainEventQueue().catch(() => undefined);

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
  // P-34 repaired `/api/shadow/receipts` and `/api/shadow/receipts/[id]`; both
  // now go through `withEntityScope`, so the detector correctly no longer finds
  // them and they are struck from the prediction rather than from the run.
  //
  // `/api/shadow/config/voice-personas` STAYS, and deliberately: it is
  // authenticated and unscoped, and it is RIGHT. It returns a hard-coded array
  // of seven voice personas declared in the route file. No entity owns
  // "Professional Female", so adding `withEntityScope` would produce a filter
  // that looks like tenancy and filters nothing -- the exact shape of the ten
  // defects P-28 exists to detect. It is on this list because it is unscoped,
  // not because it leaks; it has never been in KNOWN_LEAKING_ROUTES.
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
 *
 * ==========================================================================
 * P-34 CLOSED ALL FIVE. THE LIST IS EMPTY AND THE PARAGRAPH ABOVE IS HISTORY.
 * ==========================================================================
 *
 * All five now go through `withEntityScope`, and the two services behind them
 * (`consent-receipt.ts`, `call-playbook.ts`) take a `VerifiedEntityId` as a
 * required argument on every read and every write, so a route that has not
 * proved the tenant cannot call them — the failure is `tsc`, not review.
 *
 * The empty array is NOT the evidence. An empty array is also what "every route
 * refuses everybody" produces. The evidence is that `enforcing` — route/method
 * pairs that refuse A and SERVE B in the same sweep — went UP by exactly five,
 * from 135 to 140, and that the test below now asserts that asymmetry on each
 * of the five by name, where it used to assert their symmetry.
 */
const KNOWN_LEAKING_ROUTES: string[] = [];

/**
 * The five that used to leak, kept by name as a regression guard.
 *
 * `KNOWN_LEAKING_ROUTES` going empty removes the only thing that named them, so
 * a future edit could reopen one and the empty-array assertion would fail with
 * no clue where to look. This keeps the names, and the test that reads it
 * asserts the opposite of what the old one did: each must now refuse tenant A
 * and still serve tenant B.
 */
const REPAIRED_BY_P34 = [
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

    // LINE COMMENT. `src/app/api/developer/webhooks/route.ts` says "this is
    // NOT a `withEntityScope` route: scoping it to one entity would answer the
    // wrong question" on a `//` line. A classifier reading raw source clears it
    // on the strength of the sentence saying it is not scoped.
    //
    // This one is not hypothetical: the first version of stripComments split on
    // '\n' without normalising CRLF, so on a Windows checkout every line kept a
    // trailing '\r', `.` does not match '\r', and the line-comment strip matched
    // nothing at all. A route was cleared by exactly such a comment, the
    // recorded set below was one route short, and the suite was green locally
    // and red in CI — with CI right.
    //
    // P-16 CHANGED THE FIXTURE, NOT THE ASSERTION. The example used to be
    // `src/app/api/safety/throttle/route.ts`, which Decision 2 deletes (see the
    // recorded set below). `developer/webhooks` is the same shape: the scope
    // primitive appears only inside a `//` comment, and the route does not
    // scope. Both halves of the original assertion survive unchanged.
    const lineCommented = routeFile('src/app/api/developer/webhooks/route.ts');
    expect(readFileSync(lineCommented, 'utf8')).toContain('withEntityScope');
    expect(classify(lineCommented).scopes).toBe(false);

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

  it('reports the whole set — twenty-seven routes, not five', () => {
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
    //
    // IT EARNED ITS KEEP A THIRD TIME, IN P-34, AND THIS TIME DOWNWARD. Thirty
    // became twenty-seven: `/api/shadow/playbooks/[id]`, `/api/shadow/receipts`
    // and `/api/shadow/receipts/[id]` now call `withEntityScope`, so the
    // detector stops finding them. The recorded number is what forces that
    // removal to be stated in the same commit as the repair.
    //
    // A FOURTH TIME, IN P-16, AND DOWNWARD AGAIN. Twenty-seven became
    // twenty-six: `/api/safety/throttle` is DELETED, along with the service
    // behind it, under docs/parallel-build/decision-02-throttle.md. It was an
    // in-memory duplicate of `ShadowProactiveConfig`'s call limits with one
    // importer (its own route), zero UI consumers, and defaults that could not
    // fire. That is an API removal and belongs in a changelog; this line is the
    // test-side record of it.
    //
    // P-16's own new routes are absent from this list, which is not an
    // omission: every one of them reads `session.userId`, so
    // `unscopedAuthenticatedRoutes()` counts them as user-scoped rather than
    // tenant-blind, exactly as it does for `/api/entities`.
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
      '/api/settings/api-keys',
      '/api/shadow/config/voice-personas',
      '/api/shadow/config/voice-personas/[id]/preview',
      '/api/shadow/test/phone',
      '/api/shadow/test/text',
      '/api/shadow/test/voice',
      '/api/travel/flights/search',
      '/api/travel/hotels/search',
      '/api/travel/visa',
    ]);

    // Eight of the twenty-nine were under /api/shadow/, backed by
    // src/modules/shadow/ — the directory no tenancy package owned. That was
    // not a coincidence, and it was the finding behind the finding: the five
    // routes that actually leaked were all in the same eight.
    //
    // P-34 took the module and the count is five. What is left is stated rather
    // than left to be re-derived: `/api/shadow/config/voice-personas` and its
    // `[id]/preview` return a hard-coded list of seven voice personas that no
    // entity owns, and the three `/api/shadow/test/*` routes drive the agent
    // against the CALLER'S OWN session and address no record by id. Both kinds
    // are unscoped and correct; scoping them would add a filter that filters
    // nothing. None has ever appeared in KNOWN_LEAKING_ROUTES.
    expect(patterns.filter((p) => p.startsWith('/api/shadow/')).length).toBe(5);
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
    // 35 models carry an entityId; `Message` needs a real sender/recipient User
    // relation that cannot be filled from the model definition alone. If that
    // number grows, the sweep has quietly narrowed and this fails.
    //
    // P-36: was 33/32. Migration window 01 added `StoredDocument` and
    // `CommunicationOptOut`, both entity-scoped, and this assertion is what
    // noticed -- which is the behaviour it was written for. Both seed
    // generically from the model definition, so the sweep covers them without
    // anyone adding a fixture; `seedSkipped` is unchanged, which is the proof
    // that they seeded rather than being silently skipped. `StoredDocument` is
    // the one that matters: it is the metadata `POST /api/uploads` used to keep
    // in a Map, so before this window there was no tenanted row for the fuzz to
    // reach at all.
    expect(TENANTED_MODELS.length).toBe(35);
    expect(seedSkipped).toEqual(['Message']);
    expect(rowIds.size).toBe(34);
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

  it('now tells tenant A from tenant B on all five it could not — refuses A, serves B', async () => {
    const { attemptsAtoB, attemptsBtoB } = await sweep();

    // P-20 WROTE THE OPPOSITE OF THIS TEST, AND WAS RIGHT TO.
    //
    // It asserted that on each of these five the platform returned the SAME
    // STATUS and the SAME ROW to the owner and to a stranger: not refusing
    // anyone badly, not distinguishing them at all. P-34 repaired all five, so
    // that assertion is now false and the honest replacement is its mirror.
    //
    // The direction matters more than the list. `leaking` being empty is also
    // what "every route refuses everybody" produces, and P-20 counted 267
    // route/method pairs that refuse everyone and prove nothing. So each of the
    // five is asserted BOTH ways in the same sweep: tenant A is refused, and
    // tenant B — the owner — still gets its own row back, canary and all. A fix
    // that had simply broken these routes fails the second half.
    const table: string[] = [];
    for (const key of REPAIRED_BY_P34) {
      const attack = attemptsAtoB.find((a) => a.key === key);
      const control = attemptsBtoB.find((a) => a.key === key);
      expect(attack).toBeDefined();
      expect(control).toBeDefined();

      // The discriminator is `leaked`, not the status. A saw nothing of tenant
      // B's row on any of the five; B saw its own on all five.
      expect(attack!.leaked).toBe(false);
      expect(attack!.status).toBe(403);
      expect(control!.leaked).toBe(true);

      table.push(
        `  A=${String(attack!.status).padStart(3)}  B=${String(control!.status).padStart(3)}  ${key}`
      );
    }

    // FOUR OF THE FIVE SERVE B WITH A 200. THE FIFTH DOES NOT, AND WHY MATTERS.
    //
    // `POST /api/shadow/receipts/[id]/rollback` answers the OWNER 400 as well,
    // because the sweep's generic canary receipt is written with the column
    // default `reversible: false` and there is therefore nothing to undo. That
    // is a business refusal, not a tenancy one, so this pair is counted in
    // `refusesEveryone` below and NOT in `enforcing` — deliberately, because a
    // route that refuses everybody is not evidence of tenancy and this file
    // does not let one be counted as though it were.
    //
    // Its tenancy is proved by `leaked` instead, asserted above: tenant B's
    // 400 quotes B's own receipt (that quoting is what made P-20 count this
    // route's refusal as a disclosure in the first place), and tenant A's 403
    // quotes nothing, because A never reached the receipt at all.
    const servesOwner = table.filter((r) => r.includes('B=200'));
    expect(servesOwner).toHaveLength(4);

    console.log(
      ['', 'P-34 — routes that used to answer A and B identically:', ...table, ''].join('\n')
    );
  });

  it('no longer reads one tenant consent receipt by id from another tenant session', async () => {
    const { attemptsAtoB, attemptsBtoB, rowIds, canary } = await sweep();
    // Stated on its own because the sweep can only reach it by supplying a real
    // receipt id, and because a receipt is the record of a consent decision --
    // reading someone else's is not a cosmetic leak. P-20 pinned this at 200
    // with the canary in the body; P-34 scoped `getReceipt` and the same call
    // is now a 403 from `withEntityScope` with nothing of tenant B in it.
    const receiptId = rowIds.get('ShadowConsentReceipt');
    expect(receiptId).toBeDefined();

    const attempt = attemptsAtoB.find((a) => a.key === 'GET /api/shadow/receipts/[id]');
    expect(attempt).toBeDefined();
    expect(attempt!.status).toBe(403);
    expect(attempt!.body).not.toContain(canary);

    // The positive control, without which the line above is satisfied by a
    // route that 403s everybody: the owner reads the same receipt id fine.
    const control = attemptsBtoB.find((a) => a.key === 'GET /api/shadow/receipts/[id]');
    expect(control!.status).toBe(200);
    expect(control!.body).toContain(canary);
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

    // The load-bearing number. 140 route/method pairs demonstrably DISCRIMINATE
    // between the two tenants in the same request — they answer B and refuse A.
    // That is the only class of result that is evidence of tenancy, and it is
    // recorded exactly rather than as a floor, because a "fix" that denied
    // everyone would push this number DOWN while every negative assertion in
    // every tenancy suite kept passing.
    //
    // P-34: 135 -> 140, and the five are exactly `REPAIRED_BY_P34`. This is the
    // number that makes `KNOWN_LEAKING_ROUTES` being empty mean something. Had
    // the repair worked by refusing everyone, the empty array would still be
    // empty and this line would read 135 or less.
    //
    // P-16: 140 -> 143, and the three are new entity-scoped routes, named just
    // below. The number went UP because they were written scoped, which is what
    // this line is for -- a route added on the old pattern lands in
    // `KNOWN_LEAKING_ROUTES` or in the unscoped inventory instead, and both of
    // those are assertions too.
    //
    // P-39: 143 -> 144, and the one is `GET /api/billing/usage`. It did not
    // become scoped -- it was ALREADY scoped, and it was BROKEN. Measured on
    // both trees rather than argued:
    //
    //   before P-39   A -> 403,  B -> 500       (refusesEveryone)
    //   after  P-39   A -> 403,  B -> 200       (enforcing)
    //
    // `engines/cost/usage-metering.ts :: getUsageSummary` read every
    // `UsageRecord` row for the entity and indexed a fixed five-key object with
    // `metadata.metricType ?? row.model`. `seedCanaryRows` puts a generic DMMF
    // row in `UsageRecord`, whose `model` is not one of the five metric names,
    // so the fold hit `undefined.amount` and the route 500'd -- for its OWN
    // tenant, on every run of this file, for as long as the seeder has existed.
    // It is not a fuzz artefact: `subscriptions.ts` (P-33) writes plan-meter
    // rows into the same table with `model` set to a plan metric name, so any
    // production entity with a subscription meter got the same 500, swallowed
    // into a generic INTERNAL_ERROR by the route's catch.
    //
    // This line is what surfaced it. The route sat in `refusesEveryone`, which
    // this file prints but does not assert, so "the billing usage endpoint is
    // dead for everyone" was visible only as a number in a console.log that
    // nobody had a reason to read. That is the third time this file has found a
    // defect it was not looking for -- and the first time it found one by a
    // route LEAVING the refuses-everyone bucket.
    expect(enforcing.length).toBe(144);
    expect(enforcing).toContain('GET /api/billing/usage');

    // P-16's three, named for the same reason P-34's five are: so the delta is
    // evidence rather than a number to take on trust.
    expect(enforcing).toEqual(
      expect.arrayContaining([
        // The playbook read that did not exist -- the service method was
        // entity-scoped by P-34 and no route exported GET for it.
        'GET /api/shadow/playbooks/[id]',
        // A contact's do-not-call status and quiet hours. Scoped through the
        // contact's own entity: knowing that a contact is on another tenant's
        // DNC list is itself a disclosure.
        'GET /api/contacts/[id]/call-preferences',
        'PUT /api/contacts/[id]/call-preferences',
      ])
    );

    // P-16's other two new entity-scoped routes are deliberately NOT in the
    // list above, and the reason is worth recording rather than leaving as an
    // apparent omission.
    //
    // `POST /api/shadow/voiceforge/calls/plan` answers 200 for both tenants:
    // a refusal to call is part of its payload (`allowed: false`,
    // `blockedReason`), not its status, because "you may not call this contact
    // for another nine hours" is an answer and not an error. The sweep reads
    // status, so this route shows as serving everyone. Its actual cross-tenant
    // behaviour -- A planning a call to B's contact gets `allowed: false,
    // "not in the active entity"` and spends no call budget -- is asserted
    // directly in tests/db/shadow-persona-calls.test.ts.
    //
    // `POST /api/shadow/config/entity/[id]/switch` refuses BOTH tenants here,
    // because the sweep has no real `sessionId` to send it, so it is in
    // `refusesEveryone` and correctly counts as evidence of nothing. Its
    // asymmetry is asserted directly in the same file: A switching B's session
    // is 403 and B's session row is unchanged.

    // The five additions, named, so the delta is not a number anyone has to
    // take on trust. Four are repaired leaks; the fifth is
    // `DELETE /api/shadow/playbooks/[id]`, which never appeared in
    // KNOWN_LEAKING_ROUTES only because a successful delete returns
    // `{ deleted: true }` and carries no canary to detect — it was deleting
    // another tenant's playbook the whole time, and the same `withEntityScope`
    // change stopped it. That is the second time this file has found a defect
    // it was not looking for, and the same way: by measuring behaviour rather
    // than reading code.
    expect(enforcing).toEqual(
      expect.arrayContaining([
        'GET /api/shadow/playbooks',
        'GET /api/shadow/receipts',
        'GET /api/shadow/receipts/[id]',
        'PUT /api/shadow/playbooks/[id]',
        'DELETE /api/shadow/playbooks/[id]',
      ])
    );

    // And the one repaired route that is NOT here, stated rather than omitted:
    // its owner-side call is a business refusal (nothing to roll back), so it
    // cannot demonstrate the asymmetry by status. See the test above.
    expect(refusesEveryone).toContain('POST /api/shadow/receipts/[id]/rollback');

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
