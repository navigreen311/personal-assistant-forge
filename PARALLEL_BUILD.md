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

- ** queried  five times, and
  no such model has ever existed.** Confirmed by the coordinator:
  `grep '^model ActionQueue' prisma/schema.prisma` returns **0**. The `as any`
  defeated the check that would have caught it and every throw was swallowed, so
  the endpoint returned a confident row of zeroes from the day it was written.
  Identical in shape to `shadow/compliance` calling four models that were not
  there — **the second instance of this exact failure mode in one codebase.**
- ** compared an entity id against a target string**,
  so its tenant filter matched nothing and every request returned the whole
  platform's audit trail. `getDailyCostSummary` had the same shape with a literal
  `|| true`.
- ** let any signed-in user cast a valid approval as
  anyone** — the request chose the name written to the audit trail.
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
