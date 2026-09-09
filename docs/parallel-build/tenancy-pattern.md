# The tenancy pattern

**Frozen 2026-09-09 by P-00.** Authoritative for how a request proves it may
touch an entity's data.

**This file and `src/shared/middleware/auth.ts` are frozen for the duration of
the parallel build.** If you believe either is wrong: **stop and escalate. Do not
edit them, and do not work around them.** Ten packages (P-04 … P-14) build
against this independently and never talk to each other. If the pattern is wrong,
all ten build correctly against different assumptions, all pass their own tests,
and the mismatch surfaces only in P-20 — after the critical path is spent.

---

## The bug this exists to close

335 API routes. **149 of them** call `withAuth`, discard the session as
`_session`, and then take `entityId` from the caller's own request body or query
string. `withEntityAccess` was already correct, and was imported by **exactly one
route**.

So the system authenticates and then does not authorize:

```
POST /api/tasks   { "title": "...", "entityId": "<someone else's entity>" }
GET  /api/tasks?entityId=<someone else's entity>
```

Both succeed. `src/modules/tasks/services/task-crud.ts` contains **zero
references to `userId`** — `createTask` checks that the entity *exists*, never
that the caller owns it.

---

## The pattern

### 1. Routes use `withEntityScope`

```ts
// BEFORE — authenticated, not authorized
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    const body = await req.json();
    const task = await createTask({ ...body });   // entityId straight off the wire
    return success(task, 201);
  });
}

// AFTER
export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    const body = await req.json();
    const task = await createTask({ ...body, entityId }, session.userId);
    return success(task, 201);
  });
}
```

`withEntityScope` resolves the entity from the path param, query string, request
body, or the session's `activeEntityId` — then **proves the caller owns it**
before the handler runs. Where the value came from stops mattering: a
caller-supplied id is fine precisely because it is verified first.

It returns `400 ENTITY_REQUIRED` when nothing resolves, `404` when the entity
does not exist, `403 FORBIDDEN` when it belongs to someone else.

For a path param you already parsed, pass it explicitly as the third argument:

```ts
return withEntityScope(request, handler, params.entityId);
```

### 2. Services take `VerifiedEntityId`, not `string`

This is the half that makes the bug **impossible to reintroduce**:

```ts
// src/modules/tasks/services/task-crud.ts
import type { VerifiedEntityId } from '@/shared/middleware/auth';

export async function createTask(
  params: { title: string; entityId: VerifiedEntityId; /* ... */ },
  userId: string
): Promise<Task> { /* ... */ }
```

`VerifiedEntityId` is a branded string: it is an ordinary string at runtime and
costs nothing, but a plain `string` **is not assignable to it**. The only way to
obtain one is `withEntityScope`, which checks ownership.

So this stops compiling:

```ts
const body = await req.json();
await createTask({ ...body, entityId: body.entityId });
//                                    ^^^^^^^^^^^^^^
// Type 'string' is not assignable to type 'VerifiedEntityId'
```

**That is the enforcement mechanism.** `tsc --noEmit` catches the audit's core
failure mode in CI, rather than leaving it to review — and review is exactly what
missed it 149 times.

### 3. Every module package adds a real-database tenancy test

Not a mocked one. A mocked Prisma client cannot observe a missing tenant check —
that is why 5,268 passing tests never saw this. Put it in `tests/db/`:

```ts
it('refuses a cross-entity read', async () => {
  // entity A's session, entity B's id
  const res = await GET(requestAs(userA, `/api/tasks?entityId=${entityB.id}`));
  expect(res.status).toBe(403);
});

it('refuses a cross-entity write', async () => {
  const res = await POST(requestAs(userA, '/api/tasks', { entityId: entityB.id }));
  expect(res.status).toBe(403);
});
```

P-01 lands the harness these use. **P-04 is the reference implementation** — read
its diff before starting your own module.

---

## Rules

- **Never** call `withAuth` and discard the session. If a route genuinely has no
  entity in scope, say so in a comment explaining why.
- **Never** widen a service signature back to `string` to make a call site
  compile. That is the bug returning. Get a `VerifiedEntityId` instead.
- **Never** cast: `body.entityId as VerifiedEntityId` defeats the whole
  mechanism. If you find yourself reaching for it, you need `withEntityScope`.
- Identity never comes from a request header. `x-user-id` and `x-entity-id` are
  client-settable. See `resolveActor` and `resolveVerifiedEntityId`.
