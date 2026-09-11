# PARALLEL_BUILD.md — baselines, corrections and the merge ledger

**Owned by P-00 (coordinator). Every other package reads it; only the coordinator
writes it, except the ledger row appended at each merge.**

Established 2026-09-09 against `0f098288` on `master`. Authoritative for **what
the board looked like before this run started**. Every package's gate is measured
against what is recorded here.

---

## THREE THINGS THIS RUN RESTS ON

*Reproduced verbatim in every package prompt. If these and the coordination plan
ever disagree, the plan is authoritative and this file is stale — say so rather
than reconciling them quietly.*

> **1. The schema is frozen.**
>
> P-00 landed every model this run needs in one migration
> (`20260909172049_platform_control_plane`). Two agents running
> `prisma migrate dev` produce colliding timestamped directories and a corrupt
> `_prisma_migrations` ordering — the fastest way to destroy a parallel build.
> **A migration in your PR is an automatic hand-back.** If a model you need is
> missing or wrong-shaped: **STOP and escalate.** Do not add it, and do not work
> around it with raw SQL.
>
> **2. The tenancy pattern is the whole run.**
>
> `src/shared/middleware/auth.ts` and `docs/parallel-build/tenancy-pattern.md`
> are the agreement about how a request proves it may touch an entity's data.
> Ten packages implement it independently against that one file. If it is wrong,
> ten packages build correctly against different assumptions, all pass their own
> tests, and the mismatch surfaces only in P-20's cross-tenant fuzz — after the
> whole critical path is spent. **If you believe it is wrong: STOP and escalate.
> Do not edit `auth.ts`, and do not work around it.**
>
> **3. CI has never passed in this repository's history.**
>
> 115 workflow runs, 0 successes, on any branch. `main` is red before you start
> and stays red until P-19. **Your gate is "no new failures against the baseline
> recorded below" — never a green board, which is not available to you.** Do not
> "fix" the standing red. Do not flip `ignoreBuildErrors`. Do not remove
> `continue-on-error` from the lint step. Those belong to P-19, last, alone.
> Doing them early breaks the build for every agent still working, **and it
> would look like progress**.

---

## THE BASELINE

Captured at `0f098288`, before any P-00 change. Compare against this, not against
zero, and not against a green board.

### Type check — `npx tsc --noEmit`

```
72 errors
```

After P-00: **67**. The five that resolved were `prisma.shadowCallAttempt`
references, fixed by adding the one genuinely missing model. The remaining 67
belong to P-02.

### ⚠️ CORRECTION TO THIS BASELINE (2026-09-09, after P-02)

**The baseline below was measured with the wrong command, by me, and downstream
packages should use the corrected figures.**

CI runs `npx jest --passWithNoTests --coverage --ci`. I recorded the baseline with
`npx jest --ci`, without `--coverage`, and only on Windows. The counts happen to
be the same either way, so the numbers below stand — but they were never a
faithful reproduction of the CI command, and on Linux they are not the whole
story. **Run the CI command verbatim when you measure.**

P-02 taking `tsc` to 0 caused the `Run tests` step to execute in CI **for the
first time in this repository's history**. It immediately surfaced 10 pre-existing
`OfflineQueue` failures that appear only on the Linux runner and pass on Windows.
They are not P-02's, they were never observable before, and they are now on the
P-19 blocker list below.

### Unit suite — `npx jest --ci`

```
Test Suites: 1 failed, 319 passed, 320 total
Tests:       1 failed, 5267 passed, 5268 total
Time:        ~14 s cold
```

**The one failure is pre-existing and is not yours:**

```
FAIL tests/unit/analytics/goal-tracking.test.ts
  ● updateGoalProgress › should set ON_TRACK when pace >= required pace
    Expected: "ON_TRACK"
    Received: "AT_RISK"
    at tests/unit/analytics/goal-tracking.test.ts:130:28
```

Owner: **P-13** (analytics). Nobody else touches it. **P-19 cannot declare CI
green until P-13 fixes it** — the type errors are not the only thing standing
between this repo and its first green run.

### Real-database suite — `npm run test:db`

Did not exist at baseline. After P-00: **16/16 passing**.

### CI history

```
115 runs total, all branches:  { failure: 98, cancelled: 17, success: 0 }
```

`Run tests` is sequenced after `Type check`, so on `master` the suite has not
executed in CI since at least 2026-04-14, and `Build`, `Security Scan` and
`Docker Build` have never executed on `master` at all.

### The build is a false green

`next.config.ts:9` sets `typescript: { ignoreBuildErrors: true }`. The production
build succeeds while shipping all 67 type errors. Only the standalone
`tsc --noEmit` job is honest, and it is the one that is red. **P-19 owns that
line. Nobody else touches `next.config.ts`.**

---

## CORRECTIONS TO THE AUDIT, FOUND WHILE LANDING P-00

The audit is precedent, not gospel. Six things changed on contact with the code.
Read these before working from the audit document.

**C1 — The test suite passes. The tests were never the problem.**
The audit scored Test Coverage 22 at Medium confidence, unable to run the suite.
It runs: 5,267 of 5,268 tests pass in 14 seconds. What was broken is the *gate in
front of them*. This raises the audit's overall figure from 37% to roughly 38%.

**C2 — T-008 is three renames and one new table, not four missing models.**
Reading the receiving side rather than the names:

| code calls | actual home | status |
|---|---|---|
| `prisma.shadowCallPlaybook` | `voiceforgeCallPlaybook` | exists — rename |
| `prisma.shadowConsentConfig` | `voiceforgeConsentConfig` | exists — rename |
| `prisma.shadowDNCEntry` | `contactCallPreference` | exists — rename; already carries `contactId @unique`, `doNotCall`, `maxCallsPerWeek`, the exact shape `dnc-checker.ts:38` reads |
| `prisma.shadowCallAttempt` | — | genuinely missing; **added by P-00** |

Confirms Ivan's note: **P-02 is faster than its M sizing suggests.** 13 of the 67
remaining errors are mechanical renames.

**C3 — The audit log is not merely in-memory and forgeable. It is never written.**
`logAuditEntry` has exactly four callers and all four are inside middleware with
zero production consumers. `withHIPAAGuard`, `withConsentVerification`,
`withDataClassification`, `withAuditLog` and `withRateLimit` are imported by no
route. **There are no audit records in this system under any code path.**
T-002 is therefore not "persist the audit log" but **"persist it AND wire it into
the request path, because nothing calls it."** → **P-10, rescope accordingly.**

**C4 — `x-entity-id` was the same bug as `x-user-id`, in five more places.**
Not in the audit. The header decided *which tenant's compliance profile got
enforced*. `withHIPAAGuard` was the worst case: it read the header and passed the
request through when the header was **absent**, so PHI protection was disabled by
sending nothing at all. Fixed in P-00 and now fails closed.

**C5 — Four in-memory stores shadow tables that already exist.**
`runbookStore` → `Runbook`; `dndStore` → `DNDConfig`; `notificationStore` →
`Notification`; shadow `trustedDevices` → `ShadowTrustedDevice`. These need
**pointing at, not new models**. The schema comments say so at each site.

**C6 — A green test suite was holding the vulnerability in place. THIS HAS NOW
HAPPENED THREE TIMES. Expect it in your package.**

| # | Package | The test asserted |
|---|---|---|
| 1 | P-00 | `middleware-security.test.ts:303` — the audit actor equals the client-supplied `x-user-id` header |
| 2 | P-02 | `compliance.test.ts` mocked retention rows using DTO field names, validating the DB contract against a schema that does not exist |
| 3 | P-03 | `entity-service-expanded.test.ts` — `getCurrentUserId(Headers{'x-user-id': ...})` returns the header, and its absence returns `'stub-user-id'` |

This is not three coincidences. When code and test are written together against a
placeholder, the test records the placeholder as the requirement, and the suite
then defends it. It is why 5,268 passing tests and 115 CI runs never surfaced any
of this.

**So: when an existing test fights your change, read what it actually asserts
before assuming your change is wrong.** If it encodes the defect, correcting or
deleting it is right — but say so loudly in your PR, show that nothing else moved,
and replace it with a test that would fail against the old code. P-03 did this
well: it restored the pre-fix route and confirmed 8 of 9 new tests failed, so the
replacement is load-bearing rather than merely present.
`tests/unit/security/middleware-security.test.ts:303` asserted
`expect(loggedEntry.actor).toBe('user-42')`, where `user-42` came from the
`x-user-id` header the test itself set. The vulnerability *was the requirement*.
**Do not treat an existing passing test as evidence that behaviour is correct.**
Several more may encode the same assumption; when one fights you, read what it
actually asserts before assuming your change is wrong.

---

## PLAN CHANGE — COVERAGE GAP FOUND BEFORE THE FAN-OUT (2026-09-09)

**My package design covered 301 of 335 route files. 34 had no owner at all.**

I checked this by mapping every declared package boundary onto the actual file
tree rather than re-reading the plan, which is the only way this kind of error
shows up. Had the nine Wave 2 packages been dispatched as written, those 34
routes would have been skipped in silence, and **P-20's cross-tenant fuzz would
have discovered them at the very end of the run** — the most expensive moment
available, since by then every module package has merged and the pattern is
frozen in nine places.

No file was claimed twice, so the boundaries were disjoint. They just were not
exhaustive. Disjoint is the property I designed for and tested by eye; exhaustive
is the one I assumed.

**Unowned before this correction:**

| segment | routes | now owned by |
|---|---|---|
| `decisions` (+ the whole `src/modules/decisions` module) | 10 | **P-08** |
| `engines` | 5 | **P-13** |
| `auth` | 4 | **P-23** |
| `settings` | 3 | **P-23** |
| `onboarding` | 2 | **P-13** |
| `ai-quality`, `dashboard` (+ `src/modules/dashboard`) | 2 | **P-13** |
| `events`, `notifications`, `permissions`, `search`, `trust`, `trust-scores`, `uploads`, `webhooks` | 8 | **P-23** |

`decisions` is the serious one: ten routes and a complete module dropped between
Part 1 of the plan, which inventoried it, and Part 3, which grouped the modules
into packages and lost it.

### P-23 — Platform surface (new)

Owns the 15 cross-cutting routes no feature module claims: `auth`, `settings`,
`trust`, `trust-scores`, `permissions`, `notifications`, `events`, `search`,
`uploads`, `webhooks`.

Checked while scoping: `POST /api/auth/switch-entity` **does** verify ownership
(`prisma.entity.findFirst({ where: { id, userId: session.userId } })`) before
returning an `activeEntityId`, so the tenancy root is sound. P-23 is coverage,
not a known defect — but `activeEntityId` is what `withEntityScope` falls back to
when no entity is supplied, so this route is load-bearing for the whole pattern
and needs an owner rather than an assumption.

**Revised package count: 24** (P-00…P-23). Route coverage: **335/335.**

## PLAN CHANGE — P-13 SPLIT, P-22 CREATED (2026-09-09)

Three of the four green-board blockers sat in **P-13**, which is late in the plan.
Gating this repository's first green CI run on a late package puts the risk where
it costs most, so the test-repair work is carved out as **P-22**, running now, in
parallel with the Wave 2 fan-out instead of ahead of P-19.

**P-13's card is narrowed** to exclude these files, which now belong to P-22:

```
tests/unit/analytics/goal-tracking.test.ts
tests/unit/engines/adoption-activation.test.ts
tests/unit/capture/offline-queue.test.ts
src/modules/capture/services/offline-queue.ts
```

### The three were diagnosed before dispatch, and one diagnosis of mine was wrong

**1. `goal-tracking` is a TIME BOMB, not a regression.** The goal runs 2026-01-01
to 2026-12-31, progress is 2 of 3 tasks = 67%, and the assertion reads the real
system clock. Today is 69.0% through that window, so required pace (69) exceeds
actual (67) and `AT_RISK` is **correct**. The source logic is right; the test
encodes "now" as a hidden input. It passed until ~2 September 2026 (day 243) and
would start passing again on 1 January 2027 without anyone touching it.

**2. `adoption-activation` is the same family** — real-clock `new Date()` in the
mocks, compared at 1 ms resolution. Test-only.

**3. `offline-queue` — I described this as "Linux-only" in the P-02 ledger entry
and that was wrong about the cause.** The real one:

- `beforeEach` calls `await queue.clearQueue()` and times out at 5000 ms.
- `offline-queue.ts` is Redis/BullMQ-backed via `getRedisUrl()`.
- The CI `lint-typecheck-test` job provides **only Postgres — there is no Redis
  service**.
- The maintainer's Windows machine runs Memurai on `:6379`, which is the entire
  reason it passes there.

It is not a platform difference. It is **"requires Redis, and CI has none"**.

And that makes it a **source** bug rather than a test bug, because the file's own
header promises otherwise:

> *"Falls back to in-memory storage temporarily when Redis is unavailable, then
> drains in-memory items back to Redis once the connection recovers."*

The graceful-degradation path does not work. **Adding a Redis service to CI would
have made the board green while leaving a broken fallback in production code** —
which is why P-22 is explicitly forbidden from touching `.github/**`, and why
"the obvious fix" was the wrong one here.

**Generalisation worth carrying:** two of these three passed locally and failed
only in CI, for two entirely different environmental reasons. When a test passes
on this machine and fails on the runner, the machine is usually the one lying.

## THE BOARD WENT GREEN (2026-09-09)

**Master CI at `9c26e85`: 4 of 5 jobs pass.**

```
Lint, Type Check & Test   PASS   <- never passed before, in 115 runs
Build                     PASS   <- had never RUN; it needs the lint job green
Docker Build              PASS   <- had never RUN
Real-Database Tests       PASS
Security Scan             FAIL   <- newly REACHED, see below
```

Local on master at `06dadfa`: `tsc` **0**, unit **320/320 suites, 5269/5269
tests**, `test:db` **138/138**.

Every one of the four blockers recorded above is closed. The thing that had never
happened in this repository's history has now happened.

### The one red job, and why it is progress rather than a regression

`Security Scan` runs `npm audit --audit-level=moderate` and exits 1 on **30
pre-existing dependency vulnerabilities (1 low, 8 moderate, 17 high, 4
critical)** — `ws`, `uuid` via `bullmq` and `next-auth`, `sharp`/`libvips`.

None of this is new. It was simply **unreachable**: `Security Scan` and `Build`
both depend on `lint-typecheck-test`, so while that job was red they never
executed. Opening the gate did not create this debt, it revealed it — the same
shape as P-02 making `tsc` 0 and thereby exposing ten Linux-only test failures
nobody had ever seen.

**→ P-24 — dependency remediation.** Needs its own card. `npm audit fix --force`
across `bullmq` and `next-auth` is a real major upgrade with real blast radius,
and it touches `package.json` / `package-lock.json`, which no in-flight package
may hold. It must run alone.

## SECOND RE-SCORE — 48% -> 71% (measured, 18 packages merged)

Master: `tsc` **0** · unit **321/321, 5346/5346** · `test:db` **826/826** ·
`npm audit` **0 vulnerabilities** · CI **all five jobs green**.

| Dimension | Audit | Mid-run | Now |
|---|---|---|---|
| Feature completeness | 66 | 72 | **82** |
| Wiring & integration | 38 | 48 | **78** |
| Test coverage | 22 | 45 | **72** |
| Quality & polish | 45 | 58 | **62** |
| Production readiness | 30 | 45 | **68** |
| Platform reliability | 12 | 20 | **58** |

**Weighted: 71%** (range 66–76). Was 48%, was 37%.

### The number that actually moved

| | audit | after P-04 | after batch 1 | **now** |
|---|---|---|---|---|
| routes on the bad tenancy pattern | ~145 | 129 | 77 | **5** |

177 routes use `withEntityScope`; 182 use `withRole` (from 4). In-memory stores
78 → 64 — and the eight the audit classified BLOCKER are all persisted. The audit
log is wired into 33 files and **writes rows for the first time**.

### ⚠️ A SECOND METRIC CORRECTION, SAME MISTAKE AS THE FIRST

I first measured 7 remaining bad-pattern routes. Two were false positives: the
files mention `withAuth` and `_session` **only in a comment describing what they
used to be**. Excluding comment lines gives **5**.

That is the second time a grep over this codebase has counted prose as code — the
first was `_session` itself, which went *up* after two packages fixed 16 routes.
**Any metric quoted from this repository should exclude comment lines**, because
the packages in this run were unusually diligent about recording what they
changed, and that diligence inflates every naive count.

### The 5 that remain, and why

```
onboarding/migration/route.ts
settings/api-keys/route.ts
shadow/config/voice-personas/route.ts
shadow/receipts/route.ts
shadow/receipts/[id]/route.ts
```

Three are `shadow/` — **no tenancy package ever owned `src/modules/shadow/`**.
P-02 repaired its type errors and P-14 was explicitly told to stay out of it. The
other two fell between P-13 (`onboarding`) and P-23 (`settings`) at the boundary.
This is a real remaining gap, not noise, and it needs a small follow-up package.

### Still open

- **26 live `prisma as any`** — P-19 is on it; 115 of the 142 lint errors are this rule.
- **64 in-memory stores**, all domain-level; the control plane is done.
- **No Sentry SDK, no metrics** — T-013 and T-025 were never dispatched.
- `src/engines/trust-safety/throttle-service.ts` — a fourth counter with no
  product callers, found by P-18.

## WAVE 2 BATCH 1 — 5 PACKAGES MERGED (2026-09-09)

**Master at `12df9a7`: tsc 0 · unit 320/320, 5283/5283 · test:db 366/366 ·
`npm audit` 0 vulnerabilities.** P-09's PR was the first in this repository's
history with **all five CI jobs green**.

### Tenancy, measured

| | routes on the bad pattern |
|---|---|
| audit | ~145 |
| after P-04 | 129 |
| **now** | **77** |

88 routes now use `withEntityScope`. Just over half the affected surface is done.

### What the followers found that the audit did not

Every one of these was invisible to a 5,269-test suite and to the audit:

- **`GET /api/execution/stats` queried `(prisma as any).actionQueue` five times,
  and no such model has ever existed.** Confirmed by the coordinator:
  `grep '^model ActionQueue' prisma/schema.prisma` returns **0**. The `as any`
  defeated the check that would have caught it and every throw was swallowed, so
  the endpoint returned a confident row of zeroes from the day it was written.
  Identical in shape to `shadow/compliance` calling four models that were not
  there — **the second instance of this exact failure mode in one codebase.**
- **`GET /api/execution/timeline` compared an entity id against a target string**,
  so its tenant filter matched nothing and every request returned the whole
  platform's audit trail. `getDailyCostSummary` had the same shape with a literal
  `|| true`.
- **`POST /api/workflows/approvals` let any signed-in user cast a valid approval
  as anyone** — the request chose the name written to the audit trail.
- **`markFulfilled` scanned every contact in the database** and wrote to whichever
  tenant held the id; **`validateRecipients`** would have let `sendBroadcast` email
  and text another tenant's contacts.
- **Three routes under `/api/contacts/[id]/` never imported `withAuth`.** Scoped
  honestly: `src/middleware.ts` 401s every `/api/*` path except `/api/auth` and
  `/api/health`, so these were **not** anonymously reachable in production. The
  finding is the absence of defence in depth behind one global check whose
  public-path rule (`pathname.includes('.')`) the audit already flagged as fragile.
- **`'default-user'` writes were failing at insert.** `FollowUpReminder.userId` and
  `CannedResponse.userId` are foreign keys to `User`, so unless such a row exists
  every follow-up and canned response created through the API violated the
  constraint. The feature was **broken, not merely insecure** — and if the row did
  exist, it inverts into one shared account readable by anyone holding it.
  **Run `SELECT count(*) FROM "FollowUpReminder" WHERE "userId" = 'default-user'`
  before any deploy.** There is no safe automatic remap.

### A process lesson worth keeping

P-09 ran `git checkout -- src/` to revert a mutation experiment and **wiped its
entire uncommitted package**. It was recoverable only because the dropped stash
commit was still in the object store. It took a patch backup immediately
afterwards and before every subsequent risky step. **Commit before you mutate.**

## MID-RUN RE-SCORE — 37% → 48% (measured 2026-09-09, after 7 packages)

Re-derived against master, not asserted. The audit's original weighting, the same
six dimensions, the same platform bar.

| Dimension | Audit | Now | What moved |
|---|---|---|---|
| Feature completeness | 66 | **72** | 4 of 13 BROKEN spec items closed, 1 partial |
| Wiring & integration | 38 | **48** | a whole unreachable layer (async) now runs; tenancy only 11% |
| Test coverage | 22 | **45** | 138 real-database tests where there were none; suite proven green |
| Quality & polish | 45 | **58** | `tsc` 0; `ignoreBuildErrors` and 192 lint errors remain |
| Production readiness | 30 | **45** | CI green 4/5, worker deployed; 30 vulns, no Sentry, no metrics |
| Platform reliability | 12 | **20** | control plane still in `Map`s; audit log still never written |

**Weighted: 48%** (range 44–52). Was 37%.

### Closed since the audit

| item | evidence |
|---|---|
| Type safety | 72 errors → **0** |
| CI/CD pipeline | 0 successes in 115 runs → **4 of 5 jobs green** |
| Test suite touches a real database | 0 → **138 tests** |
| Async job processing | workers never started → **running, retry policy executing** |
| Audit actor attribution | read from `x-user-id` → verified session |

### Still open, with the honest number attached

| item | state |
|---|---|
| Entity-scoped multi-tenancy | **16 of ~145 affected routes converted — 11%** |
| Audit log written at all | 4 callers, still all in dead middleware. **Zero audit rows exist.** |
| In-memory control plane | **78 stores remain** (P-09 takes 7 of the load-bearing ones) |
| `ignoreBuildErrors` | still set — P-19 |
| eslint | **192 errors** — P-19 |

The number moved 11 points on infrastructure. **The tenancy surface itself is 11%
done**, and that is the dimension the platform bar actually turns on — so expect
the next 11 points to be slower and to come mostly from Wave 2 landing.

## ⚠️ THE AUDIT'S HEADLINE METRIC IS NOW MISLEADING — DO NOT RE-RUN IT NAIVELY

`grep -rl "_session" src/app/api --include=route.ts` returns **156**, which is
*higher* than the audit's 149, after two packages fixed 16 routes. The metric is
broken, not the work.

After conversion, this is **correct** code:

```ts
withEntityScope(request, async (req, _session, entityId) => { ... })
```

The scope is enforced by the wrapper; the handler simply has no use for the
session. P-04 anticipated this and left a note at the top of
`src/app/api/tasks/route.ts` saying `_session` is "the thing to grep for and the
thing to mistake".

**The metric that actually means something:**

```bash
# routes still on the bad pattern: withAuth + a discarded session, unconverted
for f in $(find src/app/api -name route.ts); do
  grep -q "_session" "$f" && grep -q "withAuth" "$f" && ! grep -q "withEntityScope" "$f" && echo "$f"
done | wc -l
```

**129 today, from ~145.** Anyone re-scoring this run with the naive grep will
report it going backwards.

## FINDINGS FROM WAVE 1 THAT CHANGE OTHER PACKAGES' CARDS

**P-09 — the cron scheduler has no producer.** P-11 found `registerCronTrigger`
has **zero callers**. A user who sets a schedule gets no schedule. P-11 also found
the `workflow-cron` queue had no *consumer* — which the audit missed entirely,
because unlike the other three there was no `createXWorker` symbol sitting
uncalled for a grep to notice. The consumer is fixed; the producer is P-09's.

**P-09 — a cron-started run stays `PENDING` forever.** The workflow worker never
updates `WorkflowExecutionRecord.status`, and `workflow-executor` still keeps its
`executionStore` in a `Map`. This mattered less when nothing ever fired. Ticks
fire now.

**P-09 — `activeSchedules` is an in-memory `Map`.** After a restart a repeatable
job survives in Redis while the process forgets it: a schedule that can never be
cancelled.

**P-13 — `CaptureService` never touches Prisma.** It stores everything in a `Map`,
so the capture worker consumes jobs and writes no row. Untestable against a
database by construction until P-13 persists it.

**P-13 — `uuid@13` is pure ESM and this repo's Jest cannot load it.** Any test
importing the real `capture-service` dies at import; the existing capture unit
test only survives by mocking the service away. P-11 shipped a shim. The real fix
is one `moduleNameMapper` line in `jest.config.ts`, which is coordinator-owned —
ask for it rather than working around it again.

**P-13 — `completeTask` sets `task.completedAt` unconditionally**, including on a
no-op re-completion, so the returned checklist disagrees with the stored one.
Invisible today because callers re-read. Found by P-22.

## WHAT PREVIOUSLY STOOD BETWEEN THIS REPO AND ITS FIRST GREEN CI RUN

`tsc` is 0 as of P-02. The type errors were never the only thing. **P-19 cannot
declare CI green until all four of these are closed**, and my plan sized P-19 as
M on the assumption it was only the config flip. It is not.

| # | Blocker | Evidence | Owner |
|---|---|---|---|
| 1 | `tests/unit/analytics/goal-tracking.test.ts` fails | time bomb: real clock vs a fixed 2026 window; correct as of ~2 Sept | **P-22** |
| 2 | `tests/unit/engines/adoption-activation.test.ts` flakes | 1 ms wall-clock compare; ~1 run in 4 | **P-22** |
| 3 | `tests/unit/capture/offline-queue.test.ts` — 10 failures | **NOT Linux-only** — requires Redis, CI has none, Memurai masks it locally. The documented in-memory fallback is broken. | **P-22** |
| 4 | `npx eslint src` → **192 errors, 65 warnings** | P-19 is meant to remove `continue-on-error: true` from the Lint step. That is not a one-line change. | **P-19**, resize to L |

Blockers 1–3 all land on **P-13**, which my plan sized M. **Resize P-13 to L**, or
split the test-repair work out as its own package.

## CAVEATS CARRIED FORWARD

- **Measure, do not predict.** An intermediate state of P-00 was 5 failed suites
  and 14 failed tests. The baseline is what caught it. Without a number to
  compare against, that regression would have been committed and inherited by
  every downstream package.
- **A grep finds mentions, not construction.** 79 raw `new Map<` matches reduce
  to roughly 45 genuine persistence stores; the rest are callbacks, static lookup
  tables and derived caches that are correctly in memory. Read each hit.
- **`tail -3` on a chained command is a prediction dressed as a measurement.**
- **A second intermittent failure exists, and P-19 must know about it.**
  `tests/unit/engines/adoption-activation.test.ts` failed once on a 1 ms clock
  boundary (`...964Z` vs `...965Z`) and passed on three consecutive re-runs. It is
  a real flake in a file nobody has touched. When the board is finally being
  driven green it will read as a regression. The fix is to freeze the clock in
  that test. **Owner: P-13** (engines/analytics), alongside the `goal-tracking`
  failure.
- **Cross-suite pollution exists.** `tests/unit/security/vault-service.test.ts`
  passes alone (26/26) but can fail inside a larger run depending on module
  registry ordering. If a suite fails in the full run, re-run it alone before
  concluding you broke it.
- **This machine:** PostgreSQL 17 on `:5432` (`postgres`/`postgres`), Memurai
  (Redis) on `:6379`. P-00 used a throwaway `paf_p00` database. `.env` does not
  exist in this repo and is **not** to be created by any package — pass
  `DATABASE_URL` inline.

---

## COMPLIANCE FLAGS EACH PACKAGE INHERITS

| Package | Flag | Why |
|---|---|---|
| P-03 | **AUTH** | removes an authentication bypass (`getCurrentUserId`) |
| P-06 | **PII** | inbox, contacts, communications. Also deletes the second `getCurrentUserId` (`inbox.service.ts:17-22`). **Note the constant: the inbox twin falls back to `'default-user'`, NOT `'stub-user-id'` — do not grep for the wrong string and conclude the finding is bogus.** It is also worse than the entities one: lines 496 and 594 call it with **no arguments at all**, so those two write paths unconditionally stamp `'default-user'` as the userId. That is a hardcoded identity, not merely a trusted header. |
| P-07 | **PCI** | finance and billing; Stripe is the only place idempotency exists today |
| P-10 | **AUDIT** | owns the audit trail, and per C3 must wire it as well as persist it |
| P-12 | **PHI** | health module; the HIPAA guard above it now fails closed |
| P-18 | **AUTH** | rate limiting and the `middleware.ts:33` dotted-path bypass |
| P-20 | **AUTH** | cross-tenant fuzz; the run's end-to-end proof |

---

## ACKNOWLEDGMENT RITUAL

Every package agent replies with all six before writing a line:

1. Package ID, repo, branch name, worktree path.
2. Confirmation that dependencies have **merged to main** — name the SHA — or the
   plan to wait.
3. Confirmation of having read FILES YOU MUST NOT TOUCH and the always-forbidden
   list.
4. The baseline above, quoted, so we agree what "no new failures" means.
5. **A restatement, in the agent's own words, of why the schema is frozen and why
   the red `main` is not theirs to fix.** An agent who paraphrases "the red main
   is deliberate" as "the tests are flaky" has identified itself before touching
   anything.
6. Any clarifying question about scope.

---

## MERGE LEDGER

One row per merge. Appended by the coordinator at merge time.

| # | Package | PR | Merge SHA | tsc | jest suites | jest tests | test:db | New failures | Timestamp |
|---|---|---|---|---|---|---|---|---|---|
| — | *baseline* `0f098288` | — | — | 72 | 319/320 | 5267/5268 | n/a | — | 2026-09-09 |
| 1 | P-00 coordinator | [#57](https://github.com/navigreen311/personal-assistant-forge/pull/57) | `e18a8f7` | 67 | 319/320 | 5267/5268 | 16/16 | **none** | 2026-09-09 18:59Z |
| 2 | P-01 db harness | [#58](https://github.com/navigreen311/personal-assistant-forge/pull/58) | `5c3256b` | 67 | 319/320 | 5267/5268 | **45/45** | **none** | 2026-09-09 19:2xZ |
| 3 | P-02 typecheck repair | [#59](https://github.com/navigreen311/personal-assistant-forge/pull/59) | `a271698` | **0** | 319/320 | 5267/5268 | 45/45 | **none** | 2026-09-09 19:4xZ |
| 4 | P-03 entity identity | [#60](https://github.com/navigreen311/personal-assistant-forge/pull/60) | `701d821` | 0 | 319/320 | 5264/5265 | **83/83** | **none** | 2026-09-09 20:1xZ |
| 5 | P-04 tasks tenancy (reference impl) | [#61](https://github.com/navigreen311/personal-assistant-forge/pull/61) | `f121dfe` | 0 | 319/320 | 5268/5269 | 125/125 | **none** |
| — | P-00b interface amendment (coordinator) | — | `6291c36`, `f6cb268` | 0 | 319/320 | 5268/5269 | 131/131 | **none** |
| 6 | P-22 green-board test repair | [#62](https://github.com/navigreen311/personal-assistant-forge/pull/62) | `9c26e85` | 0 | **320/320** | **5269/5269** | 131/131 | **none** |
| 7 | P-11 queue workers | [#63](https://github.com/navigreen311/personal-assistant-forge/pull/63) | `06dadfa` | 0 | **320/320** | **5269/5269** | **138/138** | **none** |
| 8 | P-07 finance tenancy | [#64](https://github.com/navigreen311/personal-assistant-forge/pull/64) | `836a9ec` | 0 | 320/320 | 5269/5269 | 190/190 | **none** |
| 9 | P-05 calendar tenancy | [#65](https://github.com/navigreen311/personal-assistant-forge/pull/65) | `c3afb61` | 0 | 320/320 | 5271/5271 | 240/240 | **none** |
| 10 | P-24 dependency remediation | [#66](https://github.com/navigreen311/personal-assistant-forge/pull/66) | `a3733e0` | 0 | 320/320 | 5271/5271 | 240/240 | **none** — audit 30 -> 0 |
| 11 | P-06 inbox tenancy | [#67](https://github.com/navigreen311/personal-assistant-forge/pull/67) | `225168c` | 0 | 320/320 | 5269/5269 | 309/309 | **none** |
| 12 | P-09 execution control plane | [#68](https://github.com/navigreen311/personal-assistant-forge/pull/68) | `12df9a7` | 0 | 320/320 | 5283/5283 | 366/366 | **none — ALL 5 CI JOBS GREEN** |
| 13 | P-12 life modules | [#73](https://github.com/navigreen311/personal-assistant-forge/pull/73) | `c24be32` | 0 | 321/321 | 5325/5325 | 665/665 | **none** |
| 14 | P-08 content + decisions | [#74](https://github.com/navigreen311/personal-assistant-forge/pull/74) | `dfbee3a` | 0 | 321/321 | 5348/5348 | 743/743 | **none** |
| — | coordinator: phone.test.ts clock | — | `4610df7` | 0 | 321/321 | 5348/5348 | 743/743 | fixed a red master |
| — | coordinator: audit chain race | — | `aa5f07d` | 0 | 321/321 | 5348/5348 | 743/743 | **none** |
| 15 | P-15 RBAC | [#75](https://github.com/navigreen311/personal-assistant-forge/pull/75) | `43b82fc` | 0 | 321/321 | 5348/5348 | 772/772 | **none** |
| 16 | P-26 search | [#76](https://github.com/navigreen311/personal-assistant-forge/pull/76) | `30a57ac` | 0 | 321/321 | 5349/5349 | 802/802 | **none** |
| 17 | P-25 test isolation | [#77](https://github.com/navigreen311/personal-assistant-forge/pull/77) | `3731bc3` | 0 | 321/321 | 5349/5349 | 802/802 | **flake eliminated** |
| 18 | P-18 rate limiting | [#78](https://github.com/navigreen311/personal-assistant-forge/pull/78) | `eb82ffa` | 0 | 321/321 | 5346/5346 | **826/826** | **none** |
| 19 | P-19 closing gate | [#80](https://github.com/navigreen311/personal-assistant-forge/pull/80) | `7531cc2` | 0 | 321/321 | 5346/5346 | 826/826 | **none** |
| 20 | P-20 end-to-end proof | [#79](https://github.com/navigreen311/personal-assistant-forge/pull/79) | `2dc2ed9` | 0 | 321/321 | 5346/5346 | **849/849** | **none** |
| — | coordinator: `.dockerignore` recursive test patterns | — | `d58e936` | 0 | 321/321 | 5346/5346 | 849/849 | fixed a red master |
| — | coordinator: db job ceiling 15 -> 30 min | — | `f2c87bf` | 0 | 321/321 | 5346/5346 | 849/849 | **none** |
| 21 | P-29 entity switching | [#81](https://github.com/navigreen311/personal-assistant-forge/pull/81) | `eaca9eb` | 0 | 321/321 | **5348/5348** | **863/863** | **none** |
| 22 | P-28 observability (T-013 + T-025) | [#82](https://github.com/navigreen311/personal-assistant-forge/pull/82) | `e3ddaff` | 0 | **328/328** | **5440/5440** | **887/887** | **none** |
| 23 | P-27 the three joins | [#83](https://github.com/navigreen311/personal-assistant-forge/pull/83) | `7269ff9` | 0 | 328/328 | **5446/5446** | 887/887 | **none** |

---

## STATUS

**⚠️ P-17, before you wire the retention cron:** `shadow/compliance` was
unreachable — every service addressed a nonexistent Prisma model and threw on
first call. P-02 fixed that, so the module now executes. In particular
`retention.ts` **will actually delete data**. `runRetentionCleanup()` currently
has no caller anywhere, so the deletion path is latent; issue #25's "retention
policies + nightly cleanup cron" is the thing that makes it live. Read it against
a scratch database before pointing it at anything real.

**P-16 and P-17 are quarantined.** They implement Sprint 5 (issue #24, 14
deliverables) and Sprint 6 (issue #25, 20 deliverables), both of which cite
`PAF-Shadow-MEGA-Implementation-Claude-Code-Prompt.md` by line number. That file
is **not in this repository**, and it is not on this machine — it was authored in
a different session and lives at a path this environment cannot reach. **Commit
it before dispatching either package.** Sizing them from the issue bullets alone
would be inventing scope.

**P-00 merged at `e18a8f7` on 2026-09-09.** Verified post-merge from a clean
`npm ci` on `master`: tsc 67, unit 319/320 and 5267/5268, test:db 16/16 -- all at
baseline, no new failures.

**Real-Database Tests is the first CI job ever to report green in this
repository.** The previous 115 runs produced zero successes.

Two defects in P-00 were caught by its own CI run before merge, and both are
worth knowing:

- The db lane was gated behind `lint-typecheck-test`, which is red until P-19, so
  it reported `skipping` and would never have executed for the whole run. **Do
  not gate a new job behind a permanently red one.**
- `ts-node` was missing, so no TypeScript jest config parses under a clean
  `npm ci`. **`jest.config.ts` has the same dependency**, and its step has never
  run in CI, so P-19 was going to fix the type errors and walk straight into
  this. Now fixed for both.

**P-01 merged at `5c3256b`.** The real-database harness is live and
`npm run test:db` is 45/45. **P-04..P-14: you do not build test infrastructure.**
Use it:

```ts
import { setupTestDatabase } from '@/../tests/helpers/db';
import { createTwoTenants } from '@/../tests/helpers/factories';
import { requestAs } from '@/../tests/helpers/session';

setupTestDatabase();
const { a, b } = await createTwoTenants();   // two users, two entities, two live sessions
const res = await GET(requestAs(a, `/api/tasks?entityId=${b.entity.id}`));
expect(res.status).toBe(403);
```

`getToken` is **not** mocked — the helper mints a genuine NextAuth JWE and the
production decrypt path runs. You cannot pass a tenancy test without a real
authenticated session, which is the point.

**Unblocked now:** P-02 (typecheck repair) is in flight,
then P-03, then P-04 as the reference implementation, then the Wave 2 fan-out.


---

# THE ANSWER — P-20, the package the whole run was for

**Can the audit's end-to-end scenario run today? No.** Five of nine checkpoints
pass. Four fail, **all four in the joins, and no package failed one.**

| leg | verdict |
|---|---|
| register / two entities / task via API | PASS |
| **workflow triggers ON THE TASK** | **FAIL** |
| executes through the queue | PASS |
| **audit row for the action** | **FAIL** |
| **entity A refused entity B** | **FAIL** |
| switch fires and is audited | PASS |
| **the agent STOPS** | **FAIL** |

P-04 built task creation, P-09 workflow execution, P-11 the queue, P-10 the audit
log. All four are correct and tested. Verified independently at merge:
`src/modules/tasks/` emits nothing and contains no audit call, and nothing
evaluates workflow triggers from task events. **The absences live between the
cards, so no card's test could fail for them.**

> Each of those tests builds its own fixture, proves its own leg against it, and
> throws the fixture away. That is the right way to test a component and it is
> **structurally incapable of finding a seam** — because a seam is not inside
> either component.

That is why eighteen green packages could coexist with a chain that does not
connect, and it is the single most transferable lesson of this run.

## Leg 7 is an unmade product decision, not a defect

`withEntityScope` compares `entity.userId` to `session.userId` — **who owns the
entity**. Correct for the audit's original defect and what ~138 refusal cases
across eleven suites assert. The audit's scenario is **one user with two of their
own entities**: ownership is satisfied both times, so nothing refuses. Entity A's
session reads, updates and cancels entity B's task, and the test asserts **the
row** — title changed, status CANCELLED — not the status code.

**Entity isolation within one account has never been decided.** It must be
decided before anyone reads leg 7 as passing. P-20 correctly refused to answer it
by editing a frozen file.

## The five that leak are all in the one directory nobody owned

503 route/method pairs swept twice against a real Postgres, tenant B seeded from
the Prisma DMMF. **Five pairs leak, two of them writes, all five under
`/api/shadow/`.** `POST /api/shadow/receipts/[id]/rollback` **undoes another
tenant's consented action** and is invisible to any static rule. Reported
honestly: 135 pairs demonstrably discriminate between tenants; **267 refuse
everyone and are counted nowhere.**

## The merge itself produced the run's sharpest finding

Rebasing P-20 onto P-19 moved the recorded unscoped set 27 -> 29:
`/api/attention/insights` and `/api/attention/notifications` joined it, and
**neither route's tenancy changed.** Both were always tenant-blind. Both *looked*
scoped because between them they named `session.userId` **six times** in `where:`
clauses on `(prisma as any)` delegates that do not exist on this schema, inside
swallowed catches. Those queries threw on every request these routes ever served.

P-19 deleted the dead code and the hole it was covering became visible. **The
repair did not introduce the bug; it disclosed it.** Dead code that mentions the
right variable is indistinguishable from live code that uses it — to a grep, to
an instrument, and to a human reading the file.

# THE FINDING THAT REFRAMES 5,440 PASSING TESTS — P-28

P-28 shipped the check that would have caught all ten phantom-delegate bugs
before merge, with no database, no traffic and no vendor account. Injecting
`prisma.attentionEvent.findMany({})` into any route now fails
`tests/unit/observability/phantom-delegates.test.ts` with the file and line. It
reads delegate names out of the DMMF, so it stays correct after the next
migration with nothing to keep in step.

**Why the four gates this repository already had all missed them:**

  * `tsc --noEmit` passes at zero — and passed then, because 173 `as any` casts
    stood between the Prisma client and the type checker.
  * `eslint src` reports zero errors; no lint rule knows what a schema contains.
  * **186 of the unit suite's 320 files call `jest.mock('@/lib/db')`. A mocked
    delegate returns whatever the test told it to, so a mocked
    `prisma.attentionEvent.findMany` PROVES THE OPPOSITE of what is true in
    production: it proves the delegate exists.**
  * The real-database suite would catch it, but only for a route someone wrote a
    case for.

That third point is the one to carry forward. For any Prisma-touching route, a
large part of this suite was confirming its own fixtures. **A mock is a claim
about an interface, and nothing here was checking the claim.**

`src/lib/monitoring/` already existed: 350 typed lines, **zero importers**, and
`@sentry/nextjs` absent — a no-op *even with a DSN configured*. Monitoring that
was itself a phantom.

Zero dependencies added; `package.json`, `next.config.ts` and `ci.yml` untouched
despite being permitted. Sentry is reached over its documented envelope ingest
API rather than `@sentry/nextjs`, because that SDK is build-time-active and
**Docker Build runs only on master** — the same blind spot that took master red
four commits earlier, reasoned about correctly this time.

# THE ELEVENTH PHANTOM — P-29, and why Decision 1 could not have shipped without it

`POST /api/auth/switch-entity` verified you owned the entity and then **returned
the value you sent it**. No row, no cookie, no re-minted token.
`token.activeEntityId` is assigned in exactly one place — `src/lib/auth/config.ts`,
inside `if (user)`, i.e. **initial sign-in only** — and set to
`dbUser.entities[0]`, the oldest entity. The client called the endpoint and then
`update()` under the comment *"Refresh the session to pick up the new
activeEntityId"*, which re-issued the value it already had.

**Every user was pinned to their oldest entity for the life of the account while
the UI reported success.** Same shape as the ten phantom-delegate bugs: a 200, a
plausible value, nothing happened. The difference is that this one was load-
bearing for a decision the owner had just made — enforcing
`record.entityId === scopedEntityId` against a value nothing could change would
have pinned every multi-entity user permanently, a total outage for exactly the
architecture Decision 1 exists to protect.

Fixed by re-minting the session cookie server-side. **No migration**: the active
entity lives in the JWT, and `encode` from `next-auth/jwt` was already in use by
the test helpers. The ownership query is byte-identical to the one that was
already there and runs before the re-mint; the value written is `entity.id`, the
row that came back, never the caller's string; `changes` is typed
`Partial<Pick<JWT, 'activeEntityId'>>` so no other claim can be injected; and a
failed re-mint returns 500, because — in P-29's words — *"a 200 here would be the
original bug wearing the fix's clothes."*

**Twelfth consecutive package to find a passing test encoding the defect.** Leg 6
of the proof asserted `auditLogEntry.count() === 0` and listed "an entity switch"
among six unaudited things. Tightened rather than relaxed: the switch is now
asserted to be the *only* audited event, and leg 6 stays FAIL.

It also caught what the coordinator had missed: **the proof switches to entity A
and then passes `entityId=A` explicitly on every later leg**, under the comment
*"the same call the UI makes when you switch context."* The proof was tolerating
the no-op it meant to exercise. Dropping those ids is now a meaningful assertion
and belongs to whoever lands Decision 1.

# TWO COORDINATOR FIXES TO A RED MASTER

**`.dockerignore` patterns are not recursive.** `tests` excluded the top-level
directory, but `__tests__` matched only a top-level entry — so every
`src/**/__tests__/` was copied into the builder while the `tests/` one of them
imports was not. TS2307 inside the image and nowhere else. Two covers had to be
removed before it could surface: `ignoreBuildErrors` (P-19) meant `npm run build`
never type-checked, and **Docker Build reports `skipping` on PRs and runs only on
master**. P-19's PR was five-for-five green and its merge commit turned master
red. It also stopped 39 test files shipping inside the production image.

**The db job's ceiling was ~2x its normal runtime.** Raised 15 -> 30. An
identical tree ran 5-8x slower on a degraded runner (content-tenancy 28s -> 201s)
and was cancelled with everything it reached passing. `cancelled` reads like a
hang and invites a re-run; diagnose from the per-suite timings, not the
conclusion. Slow is bounded, hung is not.

# CORRECTION TO THE P-19 RECORD — the gate's scope

P-19 was recorded as "eslint 0 errors". That is true **of `src/`, which is what
the gate runs**: `npx eslint src` -> 66 problems, 0 errors. Bare `npm run lint`
across the whole repository is **331 problems, 128 errors, every one of them
under `tests/`** (87 `no-explicit-any`, 35 `no-require-imports`, 1 `no-var`).

The gate is closed on `src/`. It is **not** closed on the test tree, and the test
tree is where the tenancy proofs live. This is a follow-up, not a regression —
but "lint is green" should not be said of this repository without the scope
attached.

# WHAT IS LEFT

**Decisions only Ivan can make**
1. **Entity isolation within one account** — does entity A refuse entity B when
   one user owns both? Leg 7 cannot be scored until this is answered.

**Wiring — the four failing legs**
2. Subscribe workflow trigger evaluation to task creation.
3. Wire the audit log into task creation.
4. Make the dead-man's switch actually stop execution (it fires and audits; no
   gate is created and all four workers keep running).

**Repairs with a named owner-shaped gap**
5. The **five leaking `/api/shadow/` routes**, `rollback` first.
6. The **29** authenticate-but-never-scope routes, eight of them `/api/shadow/`.
7. `src/modules/shadow/safety/auth-manager.ts` — one word, `.unref()`.
8. **128 lint errors under `tests/`**, ungated.
9. 64 domain-level in-memory stores.
10. `trust-safety/throttle-service.ts` — a fourth counter with no product callers
    and incoherent defaults (`maxPerHour: 10, maxPerDay: 1`).
11. Six schema-window items from P-19, each its own migration: `FocusSession`;
    `Notification.source`/`.blocked`; `ActionLog.module`/`.confidence`/`.metadata`;
    `Task.completedAt`; `NotificationPreference`; `VafFallbackEvent`.
12. T-013 Sentry and T-025 metrics — never dispatched. The platform still has no
    error reporting and no metrics.


---

# STEP 6 SCOPING — the "64 in-memory stores" number, measured properly

A raw grep for `new Map<` / `new Set<` in `src/` returns **198**. That number is
useless, and quoting it would be the fourth time a naive count on this repository
has been reported as a finding.

  * **77 are function-local** — an ordinary data structure inside a function
    body. Not a store, nothing to persist, no defect.
  * **69 are module-level**, which is the real surface (the audit's "64", plus
    packages merged since).
  * **4 of those 69 are `src/lib/observability/`** — P-28's recorder, which is
    process-local **by design and documented as such**, because the schema is
    frozen and there is no table to write to. Fixing them would be wrong.

Spread across ~25 areas: `modules/shadow` 11, `modules/knowledge` 11,
`modules/analytics` 11, `lib/integrations` 11, `modules/attention` 9,
`modules/tasks` 8, `modules/ai-quality` 8, `modules/finance` 7, then a long tail.

**So this is not one package and must not be dispatched as one.** It touches
every module, which means it conflicts with everything, and a bulk "persist all
the Maps" pass would convert deliberate caches into schema requests.

The scoping criterion is not the count. It is: **does losing this on restart
change what a user sees?** A cache that repopulates is correct as it stands; a
store holding the only copy of a user's state is a data-loss bug. Those two look
identical to a grep and must be separated by reading each one. That separation is
the first deliverable of whoever takes Step 6 — before any persistence is written,
and it will need a schema window, since the schema has been frozen since P-00.


---

# EIGHT OF NINE — P-27 connected the three joins

```
PASS  1. register            PASS  5. executes through the queue
PASS  2. two entities        PASS  6. audit row for the action
PASS  3. task via API        FAIL  7. entity A refused entity B
PASS  4. workflow triggers ON THE TASK
PASS  8a. switch fires and is audited
PASS  8b. the agent STOPS
```

Printed by the coordinator from the merged tree. **Leg 7 is the only one left**,
and it is Decision 1's enforcement half.

The scoreboard is now self-enforcing: `expect(passed).toBe(8)` **plus**
`expect(legs['7...']).toBe('FAIL')`, so closing leg 7 forces the next package to
come back and say which leg it changed. A single loose `toBeGreaterThan` would
have let a regression in leg 4 hide behind a fix in leg 7.

**Leg 4** publishes `task.created` from `insertTask` — the private write both
public entry points already share — onto a BullMQ `domain-events` queue, matched
against ACTIVE workflows' stored triggers by a new worker. The in-process SSE
emitter in `src/lib/realtime/events.ts` was rejected because it dies with the
process and the workflow engine is a *different* process. An outbox row is the
correct answer and needs a table the frozen schema lacks — escalated with the
exact model rather than worked around. The residual window is stated: Redis
unreachable at that instant means the task commits and the event is lost, loudly.

**Leg 6** extends P-10's wrappers. Collection GET is deliberately NOT audited,
because `logAuditEntry` takes a per-entity advisory lock and auditing a polled
list would serialise the whole tenant.

**Leg 8b** writes an `ExecutionGateRule` with `expression: 'false'`, one per
entity the user owns, enforced at three doors and lifted by `checkIn`. Queue-pause
and worker-shutdown were rejected because both turn one user's contingency plan
into everyone's outage.

## THE BUG THIS FOUND, WHICH NEEDS ITS OWN PACKAGE

**`processWorkflowJob` executes nothing and abandons its run record.** It walks
the graph writing one `ActionLog` row per node, dispatches **no action handler**,
and never touches the `WorkflowExecutionRecord` it was given. **Every
cron-started workflow logs that it ran, runs nothing, and stays `PENDING`
forever.**

Deliberately not fixed in P-27, because P-20's leg 5 asserts that worker's
current output — which is exactly why the new event consumer calls the real
executor instead of re-enqueueing. This is the most serious finding since the ten
phantom delegates and it is the same shape: a plausible trace of work that did
not happen.

Also found: `POST /api/workflows` accepts any object as a trigger (`z.record`),
so `type` becomes undefined and it matches nothing forever — **P-20's own proof
file contained exactly such a trigger**; `PUT /api/workflows/[id]` accepts any
string as `status`, so `'ACTVIE'` stores fine and never runs; `handleCreateTask`
is a third task-write path using `prisma.task.create` directly and skipping the
project-scope check, despite `task-crud.ts` stating "there is no third way in";
and `Established.resourceId` in `audit-wiring.ts` was read and never assigned, so
every audit row's resourceId was a constant or `'N/A'` (fixed).

## A THIRD HANG OF THE SAME SHAPE, CAUGHT BEFORE CI

The producer's queue cache was a module-level `let` — one cache per *module
registry*. `restart-survivability` calls `jest.resetModules()` six times, so six
Queues opened and one was closed, and jest hung with every test passing. Moved to
`globalThis`, the pattern `src/lib/db` already uses, which also fixes the same
leak under Next.js hot reload.

That is the third hang of this shape in this run — after P-18's Redis singleton
and P-20's `setInterval` — and **the first one a package caught in its own work
before it reached CI**. "Suite passes, process hangs" now has three instances and
one cause: a long-lived handle with no close point.


---

# PHASE TWO — the owner's six steps, and what they cost

After P-20 answered "no, five of nine", Ivan set six steps. All six are done.
Packages 27-35, plus one migration window.

| # | package | PR | sha | what it closed |
|---|---|---|---|---|
| 23 | P-27 the three joins | #83 | `7269ff9` | legs 4, 6, 8b — **5/9 -> 8/9** |
| 21 | P-29 entity switching | #81 | `eaca9eb` | the eleventh phantom; prerequisite for Decision 1 |
| 22 | P-28 observability | #82 | `e3ddaff` | T-013 + T-025, never dispatched in phase one |
| 24 | P-30 entity isolation | #84 | `379ff43` | leg 7 — **nine of nine** |
| 25 | P-31 workflow worker | #85 | `bd9dfc1` | the worker that logged EXECUTED and executed nothing |
| 26 | P-32 workflow validation | #86 | `1e0ee02` | `'ACTVIE'` cannot be stored |
| 27 | P-33 store persistence | #87 | `32c84af` | live 2FA in a Map; trusted devices permanently empty |
| 28 | P-34 Shadow tenancy | #88 | `d54e8f4` | 11 LLM-reachable cross-tenant sites; **all 5 leaks closed** |
| 29 | P-35 lint gate | #89 | `fdabaa2` | gate covers the repo: **128 errors -> 0**, 1,350 -> 1,686 files |

## THE ANSWER CHANGED

```
P-20, 2026-09-10 06:00   FAIL 4, 6, 7, 8b        five of nine
P-30, 2026-09-10 20:00   all nine PASS           NINE OF NINE
```

**The audit's end-to-end scenario runs.** Every leg, including entity isolation
within one account, proven against a real Postgres with the record re-read rather
than the status code asserted.

## THE PATTERN THAT DEFINED BOTH PHASES

Twelve confirmed phantoms — code that reports success for work that did not
happen. Ten were `as any` over a Prisma delegate that does not exist (P-19). The
other two were not:

- **`POST /api/auth/switch-entity` returned the value you sent it.** Entity
  switching never worked; `activeEntityId` was pinned to the oldest entity for
  the life of the account (P-29).
- **Shadow's `trigger_workflow` wrote `WORKFLOW_TRIGGERED` without calling the
  executor** — and read cross-tenant while doing it (P-32/P-34).

Adjacent, same shape: `processWorkflowJob` wrote `status: 'EXECUTED'` per node
and dispatched nothing (P-31); a DELAY "completed" instantly because the queued
job was a duplicate of the tail, so **"wait five minutes" ran in zero** (P-31);
`trustedDevices` was permanently empty while four routes wrote real rows the
handlers could not see (P-33); `src/lib/monitoring/` was 350 typed lines with
zero importers and no SDK, a no-op **even with a DSN** (P-28).

**A plausible result is indistinguishable from a real one.** Every gate this
repository had — 5,499 unit tests, `tsc`, eslint, CI — passed over all of it.

## THE THREE INSTRUMENTS THAT FOUND WHAT TESTS COULD NOT

1. **P-20's behavioural sweep.** 503 route/method pairs swept twice against a
   real Postgres. Found five leaks no static rule could see, incl.
   `POST /api/shadow/receipts/[id]/rollback` undoing another tenant's consented
   action. P-34 later found a sixth **by arithmetic** — `enforcing` rose by five
   when only four routes could explain it, exposing a DELETE that returned no
   canary.
2. **P-28's phantom-delegate scan.** Reads delegate names from the DMMF; would
   have caught all ten `as any` bugs before merge, in ~2s, with no database.
3. **The end-to-end proof itself**, whose value is that it fails when a leg
   regresses — `expect(passed).toBe(9)` plus a named assertion per leg, so a fix
   in one cannot hide a break in another.

## THE FINDING ABOUT THE TEST SUITE

**205 `jest.mock('@/lib/db')` sites across 203 files.** In P-28's words: a mocked
delegate *proves the delegate exists* — the opposite of what is true in
production. **A mock is a claim about an interface, and nothing was checking the
claim.** That is how ten routes querying absent tables coexisted with a fully
green suite, and it is the single most transferable lesson of this build.

## SEVEN SCOPE-DEPENDENT NUMBERS

Every naive count on this repository has misled at least once: `_session` went
*up* after two packages fixed 16 routes; 7 vs 5 bad-pattern routes; a
`continue-on-error` that was a comment; `as any` 237 vs 367 depending on `.tsx`
and tests; in-memory stores 64 vs 69 vs 104 depending on arrays and constants;
`as unknown as` "+3" that was its own explanatory comments. **Quote no number
from this codebase without its scope attached.**

---

# ⚠️ HAZARD — read before wiring Sprint 6's retention cron (P-17)

**Wiring issue #25's "retention policies + nightly cleanup cron" as the code
stands today will delete regulatory records on the wrong schedule.**

`src/modules/shadow/compliance/retention.ts` deletes consent receipts as a
*child of the session*:

```ts
const oldSessionIds = /* sessions past message_retention_days */;
await Promise.all([
  prisma.shadowMessage.deleteMany({ where: { sessionId: { in: oldSessionIds } } }),
  prisma.shadowSessionOutcome.deleteMany({ where: { sessionId: { in: oldSessionIds } } }),
  prisma.shadowConsentReceipt.deleteMany({ where: { sessionId: { in: oldSessionIds } } }),  // <--
  prisma.shadowAuthEvent.deleteMany({ where: { sessionId: { in: oldSessionIds } } }),
]);
```

The committed spec says the opposite, twice.
`docs/specs/PAF-Shadow-Voice-Agent-v3-Final-…`, Addition 9.1:

```
message_retention_days           INTEGER DEFAULT 365,
consent_receipt_retention_days   INTEGER DEFAULT 2555,  -- 7 years (regulatory)
```

and Addition 9.3, on user-requested deletion:

> Consent receipts **RETAINED (legal requirement)** but message content within
> them is scrubbed

**A consent receipt is the record that a human authorised an action.** It is the
evidence an auditor asks for, and it is the only artefact that survives the
conversation it came from. Deleting it on the transcript's schedule destroys the
proof while keeping nothing that needed keeping.

**Why this has never caused harm, and why that is about to change:**
`runRetentionCleanup()` has **no caller anywhere in `src/`**. The deletion path
is latent. Issue #25's cron is precisely the thing that makes it live — so the
sprint's deliverable is what converts a dormant bug into nightly data loss.

**Required before any cron is registered:** consent receipts get their own
retention period, independent of the session; deletion is proved against a
scratch database first; and the nightly job is observable (P-28's recorder) so a
run that deletes more than expected is visible rather than silent.

This is the second time this file has had to warn about `retention.ts`. The first
was P-02 making the module executable at all — before that, every service in it
addressed a nonexistent Prisma model and threw on first call, so the code could
not have deleted anything. **It can now.**


---

# THIRD RE-SCORE — 71% -> 86% (measured, 32 packages merged)

Master @ `ec14cb8`: `tsc` **0** · `npx eslint` whole-repo **0 errors** ·
unit **327 / 5,486** · `test:db` **34 / 1,034** · five CI jobs green ·
`end-to-end-proof` **nine of nine**.

| Dimension | Audit | 18 pkgs | **32 pkgs** |
|---|---|---|---|
| Feature completeness | 66 | 82 | **88** |
| Wiring & integration | 38 | 78 | **92** |
| Test coverage | 22 | 72 | **84** |
| Quality & polish | 45 | 62 | **80** |
| Production readiness | 30 | 68 | **82** |
| Platform reliability | 12 | 58 | **86** |

**Weighted: 86%** (range 82-89). Was 71%, was 48%, was 37%.

## What justifies the jump, and it is one thing

**The audit's end-to-end scenario runs.** At the 71% re-score it did not — P-20
measured five of nine legs, with all four failures in the joins. Wiring &
integration moving 78 -> 92 is that, and nothing else would have moved it.

| | audit | 18 pkgs | now |
|---|---|---|---|
| routes with entity scoping | ~0 | 177 | **202** of 347 |
| routes with role gating | 4 | 182 | **201** |
| module-level in-memory stores | ~64 | 64 | **55** |
| live `as any` in `src/` | 173 | 0 | **0** |
| lint gate scope | nothing | `src` (1,350 files) | **whole repo (1,686)** |
| known leaking routes | 5 | 5 | **0** |
| orphaned Prisma models | 5 | 5 | **1** |

## ⚠️ A NINTH SCOPE-DEPENDENT COUNT, CAUGHT IN THE ACT

`grep -rn "as any" src/` returns **14**. **All fourteen are comments** — P-19's
own records of the casts it removed. Live occurrences are **0**, which the lint
gate enforces as an error.

Same cause as the very first one on this repository: prose counted as code. It is
now the ninth. **Quote no number from this codebase without its scope attached.**

## Why not higher

**Platform reliability at 86, not 95.** Thirteen phantoms were found; the
thirteenth was a break-glass security control that wrote to a `Map`. The rate of
discovery has not yet fallen — P-16 found a compliance route silently discarding
`neverDisclose`, P-37 found a kill switch with no route. **A codebase stops
earning a reliability score when packages stop finding this class of bug, and
this one has not.**

**Production readiness at 82, not higher.** No vendor is provisioned: Twilio
(four `[E]` deliverables), Sentry (works without a DSN by design, but no DSN),
no deploy target. Those are procurement, not code.

**Test coverage at 84.** 5,486 unit tests, but P-28's finding stands: **205
`jest.mock('@/lib/db')` sites across 203 files**, where a mocked delegate proves
the delegate exists. The DMMF scan closes the specific hole; the general one —
*a mock is a claim about an interface* — is structural.

**Feature completeness at 88.** Sprint 6 is in flight; Sprint 5's four `[E]`
items are wired but unverifiable without an account.

## The three failure modes, and which are now caught

1. **A table exists and nothing queries it** — `control-plane-schema.test.ts`
   asserts *reference* since P-36. **Caught by CI.** `KNOWN_ORPHANS` = 1.
2. **A module is imported and nobody calls its functions** — P-16 and P-17's
   entire shape. **Nothing catches this.** It is the most valuable instrument
   this repository does not have.
3. **Code runs and reports success for work it did not do** — thirteen phantoms.
   Caught only by tests that assert a durable effect through a real entry point,
   which is now the standard every package is held to.

---

# THE INSTRUMENT THIS REPOSITORY DOES NOT HAVE — measured, viable

Failure mode 2 — *a module is imported and nobody calls its functions* — is the
one nothing catches, and it is the entire shape of Sprints 5 and 6. Every one of
P-16's nine deliverables existed as correct code with no caller.

A naive unused-export check is hopeless: **1,760 exported functions** in `src/`.
But the pattern that actually fails is narrower and countable — the module-scope
service singleton, `export const x = new SomethingService()`. **There are 49.**

Asking, for each, whether any file *other than its own* calls a method on it:

```
live: 30      dead: 19
```

**Hand-verified 3 of 3.** A barrel re-export is the only reference to
`vaultService` and `offlineQueue` — a re-export is not a call. **`usageTracker`
has no reference anywhere at all**, not even a re-export.

The nineteen:

```
usageTracker        (src/lib/ai/usage.ts)              -- AI cost tracking. Money.
vaultService        (security/vault-service.ts)        -- SECURITY
provenanceService   (security/provenance-service.ts)   -- SECURITY
redactionPipeline   (shadow/compliance/redaction.ts)   -- PII/PHI. P-17 is wiring it.
failoverManager     (shadow/monitoring/failover.ts)    -- v3 Addition 8.3
dlpStore, exportStore, policyStore, ssoStore           -- admin services
offlineQueue, screenshotService                        -- capture
toolStore, importStore, wizardStore
webChatHandler, workflowCompanionService
commandParser, voiceForgeHandoffService, wakeWordService
```

**This is the check to build, and the constraints are set by P-35's precedent:**
it built a factory-scan, got 66 candidates, hand-checked the first two, found
both false positives — *import-granular is not function-granular* — and correctly
**refused to ship it**. So: prove it against known-true cases
(`notificationEscalator` before P-16, `addToDigest`, `breakGlassRevoke` before
P-37 gave it a route) **and** known-false ones (barrel re-exports, types, test
helpers) before it gates anything. **If it cannot be made clean, it ships as a
report, not a gate** — a noisy gate teaches people to disable gates, which is how
`continue-on-error` got there in the first place.

---

## P-38 — built, and it gates. The count moved, and the move is the lesson.

`tests/support/reachability.ts` resolves imports through the TypeScript AST
instead of grepping for the name; `tests/unit/architecture/service-reachability.test.ts`
is the gate, with a `KNOWN_DEAD` list guarded in both directions exactly as
P-36's `KNOWN_ORPHANS` is.

**Scope, stated with the number, because this repository has now produced ten
counts that misled.** Subjects are `export const x = new Y()` at module scope in
`src/**`, excluding `new Map()`/`new Set()` and friends. Callers are every
non-test file in `src/**` and `scripts/**`.

```
49 -> 42 subjects      30/19 -> 29 live / 13 dead
```

Both differences are the reason the AST was worth it:

- **`retentionService` is declared twice** — `security/services/retention-service.ts`
  (dead) and `shadow/compliance/retention.ts` (live, via its route and the
  retention queue). Keyed by name, the live one forgave the dead one. It is the
  tenth misleading count, and it was inside the measurement of the other nine.
- **Seven of the nineteen were `new Map()`** — `dlpStore`, `exportStore`,
  `policyStore`, `ssoStore`, `toolStore`, `importStore`, `wizardStore` — exported
  only as a test seam, in modules whose functions routes call perfectly well
  (`/api/admin/dlp` calls `getDLPRules`). Listing a store beside `vaultService`
  is how a gate earns its first "oh, ignore that one".

**Validated against the trees where the answer is already known**, since a check
nobody watched reject anything is prose: `notificationEscalator`,
`digestOptimizer` (which owns `addToDigest`), `redactionPipeline` and
`adaptiveChannelService` all read `dead` at `53d0caf` (master before P-16);
`redactionPipeline` still `dead` at `4ffb406` (before P-17); `breakGlassRevoke`
`dead` at `2efebaa` (before P-37); all four read `live` on master today. Zero
false positives across 13 of 13 hand-checked findings on master and 19 of 19 at
pre-P-16 master.

**The three the coordinator asked about are all genuinely dead, and two of them
are a hole P-36's check cannot see.** `vaultService` is the only code in `src/`
that touches `prisma.vaultEntry`, `vaultSecret` and `vaultKey`, and there is no
`/api/vault` route at all; `provenanceService` is the sole toucher of
`prisma.provenanceRecord`. Those four models pass
`tests/db/control-plane-schema.test.ts` — they *are* referenced — and no row can
ever be written to them. `usageTracker` is worse still: `src/lib/ai/usage.ts` is
imported by nothing, not even re-exported by `lib/ai/index.ts`, so every
Anthropic call this platform makes is unmetered.

**Scope 2 was measured and refused, and must not be rebuilt.** 773 exported
functions under `src/modules/<m>/services/`, 291 live, 482 dead. Twenty hand
checked, nineteen true — and the twentieth,
`workflows/services/action-handlers.ts :: handleLogFinancial`, runs in
production, reached through the `ACTION_HANDLERS` dispatch table in its own file
by an `executeAction` that `workflow-executor.ts` imports. 122 of the 482 are
referenced a second time inside their own file, so each needs an intra-file call
graph before its verdict means anything. `fixtureDispatchTable()` reproduces the
miss in six lines and the suite asserts it, so the dead end is executable rather
than prose that drifts.
