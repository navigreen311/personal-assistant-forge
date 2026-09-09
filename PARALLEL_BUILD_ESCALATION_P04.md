# PARALLEL_BUILD_ESCALATION_P04.md

**From:** P-04 (Tasks & Projects tenancy — the reference implementation)
**To:** P-00 (coordinator)
**Branch:** `feature/p-04-tasks-tenancy`, branched from `64d3a88` (`origin/master`)

Nothing here blocked the package. Everything here will be hit by P-05…P-14, most
of it in their first hour, so it is written up rather than solved locally and
forgotten.

---

## GAP 1 — There is no way for trusted server-side code to obtain a `VerifiedEntityId`

**Severity: this one will bite all nine followers.**

`VerifiedEntityId` can only be produced by `withEntityScope` (and
`resolveVerifiedEntityId`), both of which require a `NextRequest`. Every module
in this system has code that acts on an entity's data with no HTTP request in
play: a worker, a cron job, a webhook pipeline, an AI job. That code cannot
obtain the brand, and the brief forbids casting to it — correctly, because a
cast is exactly how the mechanism gets hollowed out.

**Where P-04 hit it.** `src/lib/shadow/meeting/processor.ts:124` calls
`createTask`. It is a background pipeline: it reads a calendar event row, takes
`event.entityId` off that row, and creates tasks for the meeting's action items.
There is no request, no session, and no user to authorize — the entity is not
being *claimed* by anyone, it is being *read out of the database*.

**What P-04 did, and it is an interim answer, not the pattern.** `task-crud.ts`
exports a second, deliberately awkward entry point:

```ts
export async function createTaskForEntityOwner(
  params: TaskDraft & { entityId: string }
): Promise<Task>
```

It is safe only because of the rule in its name and in its banner comment: the
`entityId` must have come off a database row, never off a request. It is NOT
re-exported from `src/modules/tasks/index.ts`, so
`grep -r createTaskForEntityOwner` finds every use in one line. It has exactly
one caller.

**What we would rather have**, and what the coordinator should consider adding to
the frozen `auth.ts` before too many packages invent their own version:

```ts
/**
 * Prove an entity belongs to a user outside a request. For trusted server-side
 * code (workers, cron, webhooks) that already knows whose work it is doing.
 */
export async function verifyEntityForUser(
  entityId: string,
  userId: string
): Promise<VerifiedEntityId | null>;

/**
 * The entity a database row belongs to, as a verified scope. For pipelines that
 * derive the tenant from a row rather than from a caller.
 */
export async function verifiedEntityIdOfRecord(
  entityId: string
): Promise<VerifiedEntityId | null>;
```

Either one removes the need for a per-module escape hatch. Until then, **expect
every module package to need something like `createTaskForEntityOwner`, and
expect nine differently-named versions of it** unless this is settled centrally.

---

## GAP 2 — There is no way for a TEST to obtain a `VerifiedEntityId` either

P-01's harness (`tests/helpers/{db,factories,session}.ts`) mints real sessions
and real requests, which is everything a `tests/db/` route test needs — and
`tests/db/tasks-tenancy.test.ts` uses exactly that and contains **no cast at
all**.

But a *unit* test that calls a service function directly has no request, and so
cannot produce the argument the service now demands. This module has ten such
suites (≈170 call sites).

**What P-04 did.** Each affected test file defines one named, documented helper:

```ts
function verified(id: string): VerifiedEntityId {
  return id as VerifiedEntityId;   // TEST-ONLY. See GAP 2.
}
```

Ten files, one cast each, all in `tests/`. **`src/` contains zero**, which is the
invariant that actually matters:

```
$ grep -rn "as VerifiedEntityId" src/ | grep -v shared/middleware/auth.ts
(no output)
```

**What we would rather have:** one export in `tests/helpers/factories.ts` (P-01's
file, which P-04 must not edit) —

```ts
/** A VerifiedEntityId for a unit test that has no request. Never used by src/. */
export function verifiedEntityIdForTest(id: string): VerifiedEntityId;
```

— so the manufacture lives in one place the whole run can see, instead of ten
places per package × ten packages. **Recommend the coordinator land this before
P-05 starts**, and tell the nine followers to import it rather than write their
own.

---

## GAP 3 — Recurring task configs are a process-global in-memory Map

`src/modules/tasks/services/recurring-tasks.ts` keeps `RecurringTaskConfig`
objects in a module-level `Map`. There is no Prisma model for them and the
schema is frozen, so P-04 did not add one.

Two separate problems, one of which P-04 fixed:

- **Fixed (no migration needed):** the Map had no tenant on it, and
  `adjustCadence`, `deactivateRecurring`, `generateNextOccurrence` and
  `checkSLACompliance` each took a bare `configId`. One process serves every
  tenant, so any authenticated caller could re-cadence or switch off any other
  tenant's recurring task by naming its id. The config now carries the
  `entityId` it was created under and every lookup goes through one
  `getScopedConfig` helper.
- **Not fixed, and not P-04's:** the store is still in memory. Configs are lost
  on restart and are not shared between server instances, so the feature does
  not work in any deployment with more than one process. That needs a model,
  which needs a migration, which is frozen. **Flagging for the post-run backlog.**

---

## SCOPE — four files edited outside P-04's allowed list

Each was forced by a signature change to a service P-04 owns, and each is
mechanical. Listed here so the coordinator can review them deliberately rather
than find them in the diff.

| file | change | why |
|---|---|---|
| `src/lib/shadow/meeting/processor.ts` | 2 lines: import + call site, `createTask` → `createTaskForEntityOwner` | GAP 1. Without it `tsc` regresses from 0. No public signature of the processor changed, so the calendar route above it is untouched. |
| `src/lib/shadow/meeting/__tests__/processor.test.ts` | 1 line: the mocked export's key | follows the rename; behaviour identical |
| `tests/integration/task-lifecycle.test.ts` | call sites + one corrected assertion | calls `createTask`/`updateTask`/`scoreTask` directly; would not compile |
| `tests/e2e/dashboard-flow.test.ts` | entity mock in `beforeEach`, four corrected assertions | imports and exercises `GET`/`POST /api/tasks`, which are P-04's routes. Its `mockPrisma` had no `entity.findUnique` stub, so `withEntityScope` answered 404 and ten of its tests failed. The card allows `tests/e2e/task-management.test.ts` but does not mention this file; it exercises the same two routes and looks like an oversight. |

P-04 touched **no** `prisma/`, **no** `src/shared/`, **no** `docs/parallel-build/`,
and no other module under `src/modules/`.

---

## SMALLER FINDINGS, no action needed from the coordinator

1. **`GET /api/tasks/prioritize` read the user off the query string.**
   `?userId=<anyone>&entityId=<anything>` — both halves of "whose day is this"
   were caller-supplied. `userId` now comes from the session and a `userId`
   query parameter is ignored. This is a second instance of the P-03 pattern
   (identity from an untrusted input) in a place nobody was looking, and it is
   worth telling P-05…P-14 to **grep their own routes for `userId` read from a
   request** rather than only for `entityId`.

2. **`updateTask` recorded `actor: 'SYSTEM'` on every deferral.** The
   `TASK_DEFERRED` audit row named the system as the actor for edits made by
   people, so the trail recorded that something happened and never who did it.
   It is the authenticated caller now. Two tests asserted the literal `'SYSTEM'`
   and were corrected.

3. **`/api/tasks/parse` accepted an `entityId` and never used it.** The route
   validated an entity it then ignored; the name-resolution step that does touch
   the database (`resolveEntityReferences`) was never wired up, so a project or
   teammate name was never matched at all. It is wired up now and scoped, so
   names resolve only inside the caller's own entity.

4. **A deliberate behaviour change, called out rather than buried.**
   `POST /api/tasks` and `POST /api/projects` no longer *require* `entityId` in
   the body: `withEntityScope`'s frozen resolution order ends at the session's
   `activeEntityId`, so a request that names no entity acts on the caller's own.
   One test in `tests/e2e/dashboard-flow.test.ts` asserted 400 for that case —
   i.e. it required the client to state which tenant it was acting for, which is
   the habit that produced this bug. It was corrected, and
   `tests/db/tasks-tenancy.test.ts` asserts the new behaviour against a real
   database.
