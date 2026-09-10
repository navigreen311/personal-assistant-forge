# Decision 1 — Entity isolation is enforced WITHIN one account

**Decided by Ivan Green, 2026-09-10. Binding on all future packages.**

## The question P-20 raised

If one user owns both MedLink and CRE Forge, may a request scoped to MedLink
read, update or cancel a CRE Forge task?

P-20 measured the current answer and it is **yes**. `withEntityScope` compares
`entity.userId` to `session.userId` — a check on *who owns the entity*. That is
exactly right for the defect the original audit found (user A reading user B's
records), and it is what ~138 refusal cases across eleven module suites assert.
But for one user with two of their own entities, ownership is satisfied both
times, so nothing refuses. P-20's proof asserts the row, not the status code:
the title changes and the status goes `CANCELLED`.

## The decision

**Refuse it.**

> The Green Companies architecture is built around entity separation — different
> compliance profiles (HIPAA on MedLink, not on CRE Forge), different disclosure
> rules, different contacts, different VIP lists. Shadow's persona switching
> exists specifically because entity data must not leak between contexts. A
> request scoped to Entity A touching Entity B's records is a bug, even when the
> same person owns both.

The rule: **`record.entityId` must equal the scoped entity id.** Ownership
(`entity.userId === session.userId`) remains necessary and stops being
sufficient.

This supersedes the reasoning recorded at `src/app/api/tasks/[id]/route.ts`,
which argued the opposite in good faith:

> Falling through to the session's active entity would be wrong: it would answer
> about a task the caller never asked for, or 404 a task they legitimately own in
> a different entity.

Under Decision 1 a 404 (or 403) is the **correct** answer for a row in another
entity, and `withTaskScope`'s practice of adopting the row's own entity as the
scope is the bug. Every `[id]` route in every module copied that shape.

## THE BLOCKER THIS DECISION HITS, FOUND WHILE SCOPING IT

**Entity switching does not work, and never has.** `POST /api/auth/switch-entity`
verifies ownership and then returns the value it was given:

```ts
return success({ activeEntityId: entityId });
```

It writes no row, sets no cookie and re-mints no token. `token.activeEntityId` is
assigned in exactly one place, `src/lib/auth/config.ts`, inside `if (user)` —
which runs **only at initial sign-in** — and is set to `dbUser.entities[0]`, the
oldest entity. The client calls the endpoint and then `update()`, under the
comment *"Refresh the session to pick up the new activeEntityId"*; nothing was
written, and `update()` re-enters a callback whose only assignment is behind that
`if (user)`.

**So `session.activeEntityId` is pinned to the user's oldest entity for the life
of the account.** The persisted `activeEntityId` column in the schema belongs to
`ShadowVoiceSession` and is unrelated to auth.

This is the same shape as the ten phantom-delegate bugs P-19 catalogued: a 200,
a plausible value, and nothing happened.

**Consequence for implementation.** The scope check cannot ship alone. There is
no working notion of "the entity I am currently acting in" to compare a record
against, so enforcing the comparison first would pin every multi-entity user to
their oldest entity permanently — a total outage for precisely the architecture
this decision exists to protect. Making the switch real is a **prerequisite**,
not a follow-up, and it likely needs a `User.activeEntityId` column: the first
migration since P-00 froze the schema.

## Scope of the change

- 177 routes call `withEntityScope`; `src/shared/middleware/auth.ts` is frozen
  and this decision unfreezes it for the owning package alone.
- ~138 existing refusal cases assert cross-USER refusal. Those must keep passing
  unchanged — this decision adds a rule, it does not replace one.
- Only 20 assertions across 6 db suites reference `activeEntityId` at all, so
  most existing tests establish scope via `?entityId=` or a body field. Whether
  those become refusals is the central migration question and must be decided
  with measurement, not preference.
