# P-34 escalation — the Shadow module's tenancy, and the two things it cannot fix itself

Branch `feature/p-34-shadow-tenancy`, branched from `master` @ `32c84af`.

The package is complete and nothing below blocks the merge. All eleven
LLM-reachable unscoped sites in `src/modules/shadow/agent/tool-router.ts` are
closed behind one seam, `trigger_workflow` executes and no longer writes a
phantom audit row, and all five entries of `KNOWN_LEAKING_ROUTES` are repaired —
`enforcing` in P-20's fuzz went **135 → 140**, which is the number that makes the
empty list mean something.

This file carries the three things that need a decision from the coordinator,
and the map of what is still unscoped in `src/modules/shadow/` so the next
package does not have to re-derive it.

---

## 1. `Message.senderId` is foreign-keyed to `Contact`, and two writers put
##    something else in it. Both have never once succeeded.

`prisma/migrations/20260214000000_baseline/migration.sql`, line 1466:

```sql
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "Contact"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Two production writers violate it on every call:

| writer | writes | is |
|---|---|---|
| `tool-router.ts` `draft_email` / `send_email` | `senderId: context.user.id` | a **User** id |
| `broadcast-manager.ts:101` | `senderId: entityId` | an **Entity** id |

Both throw `P2003` every time. `draft_email` has never inserted a row; the
broadcast path is inside a `try` and silently records nothing while continuing
to dispatch the email. This is not a new regression — it is what the code has
always done, and it was invisible because **no test ever exercised either
writer.** P-20's fuzz reports `Message` as the one tenanted model whose canary
it could not seed, for exactly this reason.

**The code and the constraint disagree, and the constraint looks like the odd one
out.** Every reader treats `senderId` as a free string that *may* resolve to a
contact:

```ts
senderName: msg.contact?.name ?? msg.senderId      // inbox.service.ts, dashboard/route.ts
```

That `??` fallback only makes sense if a non-contact sender is expected. So the
intended model is almost certainly "`senderId` is a contact for INBOUND and the
entity/operator for OUTBOUND", and the FK should be dropped (the optional
`contact Contact?` relation keeps working without it).

**Not fixed here: `prisma/schema.prisma` and `prisma/migrations/**` are frozen
for this package, and guessing the semantics would have been worse than leaving
it visible.** What P-34 did instead:

- scoped `recipientId` to a Contact **in the active entity** — that part *is*
  tenancy and it was genuinely open (`Message.recipientId` has no FK at all, and
  `relationship-intelligence.ts` reads messages by
  `OR: [{ senderId }, { recipientId }]` on contact id, so an injected recipient
  made this entity's message readable from the other tenant's side);
- left `senderId` exactly as found, with the reasoning in the tool body;
- **asserted the split explicitly** in `tests/db/shadow-tool-tenancy.test.ts`,
  "refuses another tenant contact as an email recipient, and says which failure
  is which": the cross-tenant call is refused by the scope, and the own-tenant
  call is asserted to fail with `Message_senderId_fkey`. That test is written to
  break the day the constraint moves, so the honest control replaces it.

**Decision needed:** drop the FK (migration), or change both writers to store a
contact id. Either is a five-line change once someone owns the answer.

---

## 2. `switch_entity` does not switch anything

`tool-router.ts`, `switch_entity`. P-34 fixed its **tenancy** — it was
`entity.findUnique({ where: { id: input.entityId } })` with no filter of any
kind, the module's only cross-**USER** disclosure, returning a stranger's
company name and type to the model from one injected cuid. It now goes through
`findOwnedEntityById(userId, id)`.

It still returns `{ switched: true }` **and switches nothing.** `AgentContext` is
built once per message by `buildContext`; this tool returns a value into the
model's context window and `core.ts` uses the result only to write
`Switched to entity: X` into a consent receipt. The name is a promise the code
does not keep, and the spec's own cross-entity example depends on it:

> "What invoices does CRE Forge have?" while in MedLink context
> → Shadow switches first: "Switching to CRE Forge to check."

Making it real means moving `ShadowVoiceSession.activeEntityId` mid-turn and
rebuilding the context between tool calls. That is a behaviour change with no
existing test surface, and it belongs to whoever owns the agent turn loop, not
to a tenancy package. **Recorded rather than done**, so it is not discovered a
third time.

---

## 3. The map: what is still unscoped in `src/modules/shadow/`

257 non-test `prisma.*` calls across 25 files. The important structural fact,
which is not obvious and which the next package should read first:

> **Almost every Shadow-owned table is USER-scoped, not entity-scoped.**

| model | tenancy column |
|---|---|
| `ShadowVoiceSession`, `ShadowPreference`, `ShadowTrustedDevice`, `ShadowSafetyConfig`, `ShadowAuthEvent`, `ShadowOutreach`, `ShadowProactiveConfig`, `ShadowChannelEffectiveness` | `userId` |
| `ShadowMessage`, `ShadowSessionOutcome` | `sessionId` (→ a session that has `userId`) |
| `ShadowCallAttempt`, `ContactCallPreference` | `contactId` (→ a contact that has `entityId`) |
| `ShadowConsentReceipt` | `entityId` (nullable) |
| `ShadowRetentionConfig` | `entityId` |
| `ShadowSmsCode` | *none* |

So "sweep `shadow/` for `entityId`" is the wrong instrument for most of this
directory: the axis that matters there is `userId`, and the defect shape is the
same one — a row addressed by id with no owner filter.

**47 by-id sites remain** (`findUnique` / `update` / `delete` with a `where` that
names neither `userId` nor `entityId`). Read as follows:

- **~40 are benign.** The id came from a row the same function had already
  resolved and checked (`where: { id: existing.id }`, `where: { id: device.id }`).
  They are not entry points.
- **`interfaces/session-manager.ts` — 12 sites, `shadowVoiceSession` by
  `sessionId`, no `userId`.** This is the largest remaining surface and the one
  worth a package. Callers currently compensate: `/api/shadow/chat` re-checks
  `voiceSession.userId !== authSession.userId` by hand after fetching. That is a
  check in the caller rather than in the accessor, which is the pattern P-30
  replaced everywhere else. The fix has the same shape as this package's:
  `sessionManager` methods should take the user, not trust the id.
- **`monitoring/synthetic-tests.ts` — 16 calls, no tenancy at all.** It creates
  and deletes its own probe rows. Correct as it stands.
- **`proactive/workflow-companion.ts` — 3 × `workflow.findUnique({ id })`.**
  Cross-entity by construction, on a table that *does* carry `entityId`. It
  checks *user* ownership immediately afterwards, so it is not a cross-user leak,
  but it does not apply Decision 1 (one user's other entity passes). **It has no
  route caller anywhere in `src/app/`** — `grep` finds none — so it is currently
  unreachable module code. Fix it when it is wired, not before.
- **`compliance/gdpr-export.ts` — 30 calls.** Export and erasure, driven by
  `userId` throughout. The by-id sites there are inside a loop over rows already
  filtered by that user. Correct as it stands.

**Correctly unscoped, and must stay that way** — recorded so a later package does
not "fix" them into filters that filter nothing (the P-28 failure mode):

- `/api/shadow/config/voice-personas` and `/api/shadow/config/voice-personas/[id]/preview`
  return a hard-coded array of seven voice personas declared in the route file.
  No entity owns "Professional Female". The P-34 card listed voice-personas among
  the leaking routes; **it does not leak and never has** — it is in the
  *structural* unscoped set, and has never been in `KNOWN_LEAKING_ROUTES`.
- `/api/shadow/test/phone`, `/api/shadow/test/text`, `/api/shadow/test/voice`
  drive the agent against the caller's own session and address no record by id.

That is the whole of `/api/shadow/`'s remaining structural unscoped set: five
routes, down from eight, all five deliberate. Asserted in
`tests/db/cross-tenant-fuzz.test.ts`.

---

## 4. One bug this package found that nobody was looking for

`DELETE /api/shadow/playbooks/[id]` was deleting other tenants' playbooks.

It never appeared in `KNOWN_LEAKING_ROUTES` because a successful delete returns
`{ deleted: true }` and carries no canary for the fuzz to detect — the sweep can
only see a leak in a *response body*. It was found by the `enforcing` count going
up by five when only four repaired routes could explain it, and it is now named
in that assertion.

That is the second time P-20's instrument has found a defect it was not aimed at,
and the second time by measuring behaviour rather than reading code.
