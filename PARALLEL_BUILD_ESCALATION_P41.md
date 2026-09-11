# P-41 escalation — session tenancy, the cron leak, and six things found beside them

Branch `feature/p41-work`, branched from `master` @ `a70eb67`.

The package is complete and nothing below blocks the merge. `tsc` 0, `npx eslint`
0 errors, unit **330 suites / 5,509 tests**, db **39 suites / 1,119 tests**, all
green, and `end-to-end-proof` still prints **nine of nine**.

This file carries what the card did not name, and the counts that disagree with
what it did name.

---

## 1. The count was 13, not 12. One of the three cron sites was not the one named.

**Sites in `session-manager.ts`.** P-34's escalation, and the card after it, said
**12** `shadowVoiceSession` lookups by `sessionId` with no `userId`. The file
held **13**, by the same definition P-34 used (`findUnique` / `update` / `delete`
whose `where` names neither `userId` nor `entityId`):

| delegate | count | lines (pre-fix) |
|---|---|---|
| `findUnique` | 7 | 135, 148, 193, 236, 292, 339, 411 |
| `update` | 5 | 177, 220, 275, 320, 368 |
| `delete` | 1 | 427 |

The thirteenth is the `delete` inside `deleteSession`, which sits directly under
a `findUnique` and which a by-delegate sweep naturally reads as one site rather
than two. Nothing about the fix changes; the number in P-34's map is one low.

**Which cron site was already fixed.** The card says "P-17 already fixed one
instance — `src/lib/queue/shadow-proactive.ts` matches on `job.name`, proved by
its mutation M10". It does not. `PARALLEL_BUILD_ESCALATION_P17.md` §4 names
**`src/lib/queue/shadow-retention.ts`** as the one it fixed and lists
`shadow-proactive.ts` and `scheduler.ts` as the two it left; `shadow-proactive.ts`
on `master @ a70eb67` still filtered `if (job.id !== PROACTIVE_TICK_JOB_ID)` in
both `ensureProactiveSchedule` and `removeProactiveSchedule`. Both are fixed
here.

**`scheduler.ts` had three broken sites, not one.** The card names
`unregisterCronTrigger`. `getScheduledWorkflows` read `workflowIdOfJob(job.id)`
off the same absent field, so it reported an EMPTY LIST for every schedule that
existed — and an empty list is exactly what a caller sees when nothing is
scheduled, so the lie was invisible. `registerCronTrigger` is the third: it is
what wrote the unaddressable key in the first place.

---

## 2. Two callers had already forgotten the check the card predicted

The card's phrasing was "any caller that forgets is a leak". Two had.

`src/modules/shadow/interfaces/web-chat.ts`:

| handler | call | check |
|---|---|---|
| `handleEndSession` | `sessionManager.endSession(sessionId)` | **none** |
| `handlePing` | `sessionManager.touchSession(sessionId)` | **none** |

`sessionId` in both comes straight off the `WebChatIncoming` payload. So
`{ type: 'end_session', sessionId: <a stranger's> }` ended that stranger's
session, and a `ping` moved their `lastActivityAt` and incremented their
`messageCount` — a cross-tenant WRITE, and in `handlePing`'s case one wrapped in
a `.catch(() => {})` so it could never have been noticed. `handleActionResponse`
and `handleTextMessage` in the same file DID check, which is what makes this the
pattern rather than an accident: the check was a convention, and conventions are
kept four times out of six.

**Not live, and only by luck.** `webChatHandler` is on P-38's `KNOWN_DEAD` list
(`tests/unit/architecture/service-reachability.test.ts`) — nothing imports it, so
no route reaches these handlers today. Both are fixed and asserted in
`tests/db/shadow-session-tenancy.test.ts` § "web-chat: the callers that
compensated for nothing", including the ping case, whose proof has to be the row
rather than the response because the handler swallows the failure.

---

## 3. One tenancy refusal changed shape, deliberately, and one existing assertion
##    moved with it

`tests/db/shadow-safety-adversarial.test.ts`, "cannot confirm an action in
another tenant's session", asserted **403**. `POST /api/shadow/action` now
answers **404**.

That is the point of the change rather than a cost of it. The route used to
fetch the session by id and compare `voiceSession.userId` itself, so it could
distinguish "such a session exists but is not yours" from "no such session" —
which makes every endpoint holding a session id an existence oracle for cuids,
addressable by anybody with a login and with no HTTP status for a WAF to count.
The scoped accessor cannot tell the two apart either, because it runs one
`findFirst` filtered on both columns.

The assertion was not weakened: the status is still asserted exactly, the
`expect(await db.shadowConsentReceipt.count()).toBe(0)` that says the action did
not happen is untouched, and a **positive control was added** — tenant B's own
confirmation of the same action in the same session is asserted NOT to 404, so
the case can no longer be satisfied by a route that refuses everybody.

P-20's fuzz is unaffected: `enforcing` is still **144**, because both 403 and 404
count as refused and the legitimate control still succeeds.

---

## 4. There are THREE ways to delete a Shadow session, with three different
##    regulatory outcomes. Somebody owns this.

| path | route | what happens to the consent receipts |
|---|---|---|
| `sessionManager.deleteSession` | `DELETE /api/shadow/conversations/[id]` | **deleted** (`shadowConsentReceipt.deleteMany`) |
| a hand-written `$transaction` | `DELETE /api/shadow/sessions/[id]` | **detached** (`sessionId: null`) |
| `gdprService.deleteSession` | `POST /api/shadow/delete-session/[id]` | **scrubbed** (`scrubReceiptsForSessions`) |

All three delete the same row. Only the second and third are consistent with
P-17's §3 reasoning, that a consent receipt is regulatory evidence with a 7-year
clock of its own and must not die as a child of a 365-day transcript. The first
is the one `sessionManager` has always done, and P-41 scoped it without changing
it, because changing which regulatory records a delete destroys is not a tenancy
decision.

**Decision needed:** which of the three is the intended behaviour, and the other
two routes deleted or pointed at it. Recorded rather than guessed.

---

## 5. Two more by-id session reads with the check in the caller

Both are outside `session-manager.ts` and both DO check, so neither is a leak.
They are recorded because they are the pattern this package moved into the
accessor, and because both distinguish the two failures:

- **`src/modules/shadow/compliance/gdpr-export.ts :: deleteSession`** —
  `findUnique({ id: sessionId })`, no owner. `POST /api/shadow/delete-session/[id]`
  checks by hand and answers **403** for another tenant's session and **404** for
  a missing one. Same oracle as §3, one route along. Not fixed here: it belongs
  to whoever owns §4, and routing it through the seam would silently change which
  receipts survive.
- **`src/modules/shadow/proactive/entity-persona.ts :: switchEntity`** —
  `findUnique({ id: sessionId })`, then `session.userId !== userId` throwing
  `SESSION_FORBIDDEN`, distinct from the `SESSION_NOT_FOUND` above it. Reachable
  from `POST /api/shadow/config/entity/[id]/switch` and from `agent/core.ts`. The
  ownership check is real and P-16 was right to add it; the two distinct codes
  are the oracle.

---

## 6. Dead code found while mapping the callers

- **`SessionManager.cleanupStaleSessions` has no caller in `src/`.** Only
  `tests/unit/shadow/session-manager.test.ts` calls it. It is a platform-wide
  `updateMany` that ends or pauses every idle session for every user. It is kept
  and kept unscoped — it addresses no row by id, so it cannot be aimed at a
  tenant — and the underlying function is deliberately named
  `updateStaleSessionsAcrossAllUsers` so an unscoped sweep can never be mistaken
  for an accessor. **Not wired to a scheduler here**, on P-17's reasoning: giving
  a dormant destructive sweep a cron is the change that converts a latent bug
  into nightly data loss, and that is a decision, not a fix.
- **`ShadowMemory.endSession` (`src/modules/shadow/agent/memory.ts`) has no
  caller.** It is a `findUnique` + `update` by id with no owner, and it writes
  `status: 'completed'` — a status no other code in the module produces or reads
  (`session-manager` uses `active` / `paused` / `ended`). Left alone: it is
  unreachable, and a dead function that would write a fourth status value is
  better visible than half-fixed. `ShadowMemory.addMessage`, which IS reachable,
  also updates the session by id — but its `sessionId` arrives from
  `processWithAgent`, which the routes reach only after the scope has resolved
  the session, so it is not an entry point.

---

## 7. What the lint rule does and does not cover

`eslint.config.mjs` gains a P-41 block forbidding `@/lib/db` and
`@prisma/client` in `src/modules/shadow/interfaces/session-manager.ts`, so a
lookup added to the manager has to go through `OwnedSessionStore` and is scoped
by construction. It uses the **base** `no-restricted-imports` with a `files` glob
naming exactly one file, and both halves are load-bearing:

- P-34's block sets the same rule name on `tool-router.ts`. The two globs are
  disjoint, so neither shadows the other — **verified by mutation**: injecting
  `import { prisma } from '@/lib/db'` into `tool-router.ts` still raises P-34's
  error, and into `session-manager.ts` raises P-41's.
- `no-restricted-syntax` was **not** used, because P-17's block sets that name
  over `src/**/*.ts` and any block of mine setting it would replace P-17's
  `ShadowMessage` / `ShadowConsentReceipt` single-writer bans for the files it
  matched — P-39's lesson. **Verified by mutation**: a `prisma.shadowMessage.create`
  planted inside `session-manager.ts`, the one file my block matches, still
  raises P-17's error.

**What it does not cover:** eight other files hold by-id `shadowVoiceSession`
queries (`monitoring/synthetic-tests.ts`, `compliance/gdpr-export.ts`,
`compliance/message-store.ts`, `interfaces/voice-in-app.ts`, `agent/memory.ts`,
`proactive/entity-persona.ts`, `proactive/workflow-companion.ts`, and two route
files). P-34 characterised most of that set as correct as it stands, and the P-28
failure mode is "fixing" a correct query into a filter that filters nothing. A
repo-wide ban would have forced a decision on all eight in a package that had not
read them, so the rule guards the seam and §5 names the two that are worth
somebody's attention.

---

## 8. Mutation results, both directions

Fourteen mutations, each reverted immediately after measuring. Every one is
killed. Failure counts are tests, not suites.

| mutation | `shadow-session-tenancy` | `session-manager` (unit) | `queue-cron-cancellation` |
|---|---|---|---|
| M1 `#ownedRow` drops `userId` (the seam) | **21** | **12** | — |
| M2 `findById` stops filtering on the owner | **19** | **2** | — |
| M3 `updateById` stops filtering | **1** | **10** | — |
| M4 `deleteById`'s own `where` stops filtering | 0 | **2** | — |
| M5 `endOtherActiveSessions` loses the owner | **1** | **1** | — |
| M6 `page()` loses the owner | **1** | **2** | — |
| M7 empty-owner constructor guard removed | **1** | **1** | — |
| M8 **positive-control probe**: store refuses everybody | **18** | — | — |
| M9 route re-resolves the owner off the fetched row | **1** | — | — |
| M10 `unregisterCronTrigger` matches `job.id` again | — | — | **6** |
| M11 `registerCronTrigger` uses `add({ repeat, jobId })` again | — | — | **1** |
| M12 `shadow-proactive` matches `job.id` again | — | — | **2** |
| M13 `getScheduledWorkflows` reads `job.id` again | — | — | **4** |
| M14 legacy repeat attribution removed | — | — | **1** |

**M4 is the one worth explaining.** It survives every db case, and that is
correct rather than a gap: `deleteById` proves ownership with `findById` before
it deletes, so the scoped `where` on the `delete` itself is unreachable through
the public API — it is there because "resolve an id, then trust it" is the defect
this package closed, and the read and the write are separate statements against a
live database. The only thing that can observe it is a structural assertion over
the calls made, which is what
`tests/unit/shadow/session-manager.test.ts` § "puts the owner in every where
clause that names an id" is, and it kills M4.

**M8 is the direction the card asked for explicitly.** Making the store return
null for everybody fails 18 cases, because every case asserts the legitimate read
in the same `it` as the refusal. Without those controls all 18 would have passed
and the package would have shipped an outage as a tenancy fix — the failure mode
behind P-20's 267 refuse-everyone route/method pairs.

**One test that passes either way, named as required:** in
`tests/db/queue-cron-cancellation.test.ts`, "the entries it filters really do
carry no id (the premise of the bug)" passes against the old code too — by
design. It asserts BullMQ's behaviour, not ours, so that if a future bullmq
starts returning `id` the case fails and whoever sees it can simplify the match.
It is a premise check, and it is the only case in either new file that is not
sensitive to the fix.
