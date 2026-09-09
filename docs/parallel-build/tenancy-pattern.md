# The tenancy pattern

**Frozen 2026-09-09 by P-00. Amended after P-04 (the reference implementation)
with the recipe below, which came out of actually doing it once.**

`src/shared/middleware/auth.ts` and this file are frozen for the parallel build.
If you believe either is wrong: **stop and escalate. Do not edit them, and do not
work around them.** Nine packages (P-05 … P-14) build against this independently
and never talk to each other. If the pattern is wrong, all nine build correctly
against different assumptions, all pass their own tests, and the mismatch
surfaces only in P-20 — after the critical path is spent.

**The worked example is `f121dfe` (P-04).** Read that diff. Everything below came
out of writing it.

---

## The bug this exists to close

335 API routes. **149 of them** call `withAuth`, discard the session as
`_session`, and take `entityId` from the caller's own request. `withEntityAccess`
was correct and was imported by **one** route. `task-crud.ts` contained **zero**
references to `userId`.

So the system authenticated and then did not authorize:

```
POST /api/tasks   { "title": "...", "entityId": "<someone else's entity>" }
GET  /api/tasks?entityId=<someone else's entity>
```

Both succeeded. P-04 proved it by mutation: against the pre-fix code, a POST into
another tenant returned **201 and wrote the row**.

---

## 0. Measure your own module first

```bash
grep -rn "_session" src/app/api/<your-routes>/
grep -rn "userId"   src/modules/<your-module>/     # if this is empty, that IS the bug
grep -rn "searchParams.get('userId')\|body.userId" src/app/api/<your-routes>/
```

**That third grep is not in the audit and not in your card.** P-04 found
`GET /api/tasks/prioritize` reading `?userId=` off the query string — *both*
halves of "whose day is this" were caller-supplied. Scope is not only `entityId`.

## 1. A route: before → after

```ts
// BEFORE — authenticated, not authorized
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    const body = await req.json();
    const task = await createTask({ ...body });     // entityId straight off the wire
    return success(task, 201);
  });
}

// AFTER
export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    // `entityId` LAST, deliberately: it overwrites the caller's own value.
    const { entityId: _requested, ...draft } = parsed.data;
    const task = await createTask({ ...draft, entityId }, session.userId);
    return success(task, 201);
  });
}
```

Make `entityId` **optional** in your zod schema. Clients may still send it and it
is still verified; a client that omits it gets its session's active entity.
**Do not make the client name its own tenant** — that habit is what produced this
bug, and one test was asserting 400 when the client failed to do so.

## 2. Service signatures, and where `userId` goes

```ts
import type { VerifiedEntityId } from '@/shared/middleware/auth';

export async function createTask(
  params: { title: string; entityId: VerifiedEntityId },
  userId: string                                   // the authenticated caller
): Promise<Task>

export async function getTask(taskId: string, entityId: VerifiedEntityId): Promise<Task | null>

export async function listTasks(
  entityId: VerifiedEntityId,                      // FIRST and REQUIRED
  filters: TaskQueryFilters = {},                  // the filter bag, minus entityId
  sort?, page?, pageSize?
)
```

`VerifiedEntityId` is a branded string: a plain `string` is **not** assignable to
it, so a call site passing a raw request value **fails to compile**. That is the
enforcement. Review missed this 149 times; `tsc` will not.

**`userId` goes into:** writes (to re-assert the owner as defence in depth, and to
name the actor on audit rows — **stop writing `'SYSTEM'` for edits made by
people**), and anything that used to read a user off the request. **Not** into
every read; the `VerifiedEntityId` already carries the authorization.

**Where the scope sits in the params object — one rule, two shapes:**
- a draft the route builds **field by field** → `entityId: VerifiedEntityId` as a
  field is fine; spread it last.
- a filter bag parsed **wholesale** off the query string → the scope must **not be
  a field on it at all**, or the caller supplies their own scope again. Use
  `Omit<TaskFilters, 'entityId'>` and take the scope as its own leading argument.

## 3. Put the scope in the WHERE clause — never check-then-act

```ts
// NOT THIS — correct today, one reordered edit from being wrong
const task = await prisma.task.findUnique({ where: { id } });
if (task.entityId !== entityId) throw ...;

// THIS — a foreign row is simply not found, so there is no check to forget
const task = await prisma.task.findFirst({ where: { id, entityId } });
```

Three consequences:

- **`update` and `delete` take a unique WHERE and cannot carry the entity.** Use
  `updateMany` / `deleteMany` with `{ id, entityId }` and treat `count === 0` as
  not-found. A pre-existing test was asserting `update({ where: { id } })` — no
  entity at all — so any caller who knew an id could cancel any tenant's record.
- Apply the scope **last and unconditionally** when building a WHERE, so no
  filter combination can widen it.
- If you walk a graph (dependencies, threads, parent/child), scope **every hop**.

**Child tables with no `entityId` column** (audit/action logs — the schema is
frozen, you cannot add one): prove the scope on the **parent** and return early.

## 4. `[id]` routes — the entity is a property of the row, not the request

`withEntityScope` resolves from query / body / session, none of which apply to
`GET /api/things/<id>`. Falling through to the session's active entity is wrong:
it answers about a thing the caller never asked for. Keep this **local** to the
route file (Next.js route files may only export HTTP handlers):

```ts
async function withThingScope(request, thingId, handler) {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.thing.findUnique({
      where: { id: thingId },
      select: { entityId: true },      // the id ONLY — no data crosses this line
    });
    if (!owner) return error('NOT_FOUND', 'Thing not found', 404);
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}
```

Authenticate **first**, so an anonymous caller never reaches the database. **Do
not** pass `owner.entityId` to a service directly — it is a plain `string` and
will not compile. That error is the mechanism working.

## 5. Server-side code with no request

Added by the **P-00b amendment**, after P-04 found the interface had no path here.

- **You know whose work it is** (cron running a named user's workflow):
  `verifyEntityForUser(entityId, userId)` — the same database ownership check,
  no request needed. Returns `null` on refusal; handle it.
- **There is no user, because the entity came off a database row** (a pipeline
  reading `event.entityId`): use a **second entry point**, not a cast.

```ts
export async function createTask(params & { entityId: VerifiedEntityId }, userId: string)
export async function createTaskForEntityOwner(params & { entityId: string })  // trusted provenance
async function insertTask(params, entityId: string)                            // private shared write
```

Name it `<verb><Noun>ForEntityOwner` so `grep -rn ForEntityOwner src/` finds every
trusted write. **Do not re-export it from the module index.** The rule is in the
name: the id must have been read from a database column, never from a request.

`grep -rn "as VerifiedEntityId" src/` must stay at **zero**.

## 5b. `withEntityScope` has NO "all my entities" mode — declare it, do not drift into it

**Found independently by P-05 (calendar) and P-07 (finance) within the same hour.
Two packages, same gap, same workaround. If your module has a genuine
cross-entity view, you will hit it too.**

`withEntityScope` resolves to exactly ONE entity. So a list route that used to
mean *"everything I own"* when `entityId` was omitted now silently means *"my
active entity"*. That is a **behaviour change, not a tenancy fix**, and it is
invisible in a 403 test — every cross-tenant assertion still passes while the
feature quietly stops doing what it did.

P-04 never saw this because tasks were already single-entity.

**If the route is genuinely single-entity** (most are): use `withEntityScope` and
move on.

**If the route genuinely spans the caller's entities** — an executive view, a
cross-entity rollup, a unified inbox — do NOT use `withEntityScope`. Keep
`withAuth` and prove each entity explicitly:

```ts
return withAuth(request, async (req, session) => {
  const ids = await entitiesOwnedBy(session.userId);          // scope = the SET
  // or, for a caller-supplied list, verify each one:
  const verified = await Promise.all(
    requested.map((id) => verifyEntityForUser(id, session.userId))
  );
  if (verified.some((v) => v === null)) return error('FORBIDDEN', '...', 403);
});
```

**Say which you chose in your PR.** A route that silently narrowed from "all" to
"one" is a regression a reviewer cannot see in the diff, and P-20 will not catch
it either — its fuzz suite tests for leaks, not for things that stopped working.

## 6. The tenancy test

Real database, `tests/db/<module>-tenancy.test.ts`, P-01's harness, `getToken`
unmocked. Read `tests/db/tasks-tenancy.test.ts` — 42 cases, repetitive on purpose.

```ts
it("refuses to write into tenant B's entity, and writes nothing", async () => {
  const res = await POST(requestAs(tenantA, '/api/things', {
    method: 'POST', body: { name: 'x', entityId: tenantB.entity.id },
  }));
  expect(res.status).toBe(403);
  // a 403 that still writes is not a fix
  expect(await db.thing.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
});
```

Per route: owner → 200/201; A reads B → 403; A writes into B → 403 **and nothing
changed in the database**; no session → 401. Plus at least once each:

- **a list route** — not merely "refuses `?entityId=B`" but *an ordinary request
  whose filter matches B's row still returns nothing.* Leaking rows is a
  different failure from a single-record 403.
- **a bulk route** — foreign ids report `{ updated: 0 }` and rows are unchanged.
- **symmetry** — tenant B reaches B's own data. **A "fix" that denies everyone
  passes every other assertion in the file.**

## 7. Prove it by mutation, not by assertion

```bash
git stash push        # your fix goes away; the untracked new test file stays
DATABASE_URL=... npx jest --config jest.db.config.ts --runInBand tests/db/<yours>.test.ts
git stash pop
```

Cross-tenant cases should fail; owner-succeeds and 401 should pass. **Report both
numbers.** If a cross-tenant case passes against the old code, that route was
already correct — say so rather than claiming a fix you did not make.

## 8. Traps, in the order you will hit them

1. **`findUnique` → `findFirst` breaks your mocked unit tests silently** — the
   mock has no `findFirst`, so the call returns `undefined`. Alias it:
   `findFirst: (...a: unknown[]) => mockFindUnique(...a)`.
2. **Entity stubs need an owner.** `createX` now compares `entity.userId` to the
   caller: `{ id: 'e1' }` becomes `{ id: 'e1', userId: 'user-1' }`.
3. **Unit tests cannot mint the brand.** Use `verifiedEntityIdForTest()` from
   `tests/helpers/factories.ts` — landed by P-00b so nine packages don't scatter
   ninety casts. Real-database tests go through the route with `requestAs()`.
3b. **`uuid@13` is ESM-only and ALREADY FIXED — do not work around it again.**
   It has no CommonJS build, so a `tests/db/` file importing any service that
   transitively uses it used to die with `SyntaxError: Unexpected token 'export'`
   at *import*, which reads like a broken test rather than a module-format
   problem. P-11 hit it, P-05 hit it, and it is now mapped centrally in
   `jest.db.config.ts` to `tests/helpers/uuid-cjs-shim.ts`. `src/` still imports
   the real `uuid`. If you need an export beyond `v4`, add it to the shim.
3c. **Trap 1 has a second half** (P-05): it is not only `findUnique`→`findFirst`.
   A write that now re-asserts the owner calls a *different delegate*
   (`prisma.entity.findUnique`), and a mock that aliases several models onto one
   `jest.fn` will return the wrong row — one whose `userId` is `undefined`. Give
   it its own mock.
3d. **The §4 `[id]` block is duplicated per route file on purpose.** Next.js route
   files may export only HTTP handlers, so it cannot be extracted into a shared
   helper in the same directory. Expect four near-identical copies; do not
   "clean it up" into a module the build will reject.
4. **`tsc` includes `tests/**`.** A signature change breaks every calling test at
   once (~170 sites in P-04). That is the mechanism showing you the call sites.
5. **Callers outside your module.** `grep -rn "@/modules/<yours>" src/ tests/ -l`
   **before** changing a signature.
6. **A sync function going async** fails as an unhandled rejection, not a type
   error. Grep call sites for a missing `await`.
7. **A test that fights you is probably right about the old behaviour and wrong
   about the requirement.** Four consecutive packages found one. Read what it
   asserts; if it encodes the defect, correct it, mark it in place, and show
   nothing else moved.
