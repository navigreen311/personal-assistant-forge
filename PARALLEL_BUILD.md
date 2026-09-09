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

**C6 — A green test suite was holding the vulnerability in place.**
`tests/unit/security/middleware-security.test.ts:303` asserted
`expect(loggedEntry.actor).toBe('user-42')`, where `user-42` came from the
`x-user-id` header the test itself set. The vulnerability *was the requirement*.
**Do not treat an existing passing test as evidence that behaviour is correct.**
Several more may encode the same assumption; when one fights you, read what it
actually asserts before assuming your change is wrong.

---

## CAVEATS CARRIED FORWARD

- **Measure, do not predict.** An intermediate state of P-00 was 5 failed suites
  and 14 failed tests. The baseline is what caught it. Without a number to
  compare against, that regression would have been committed and inherited by
  every downstream package.
- **A grep finds mentions, not construction.** 79 raw `new Map<` matches reduce
  to roughly 45 genuine persistence stores; the rest are callbacks, static lookup
  tables and derived caches that are correctly in memory. Read each hit.
- **`tail -3` on a chained command is a prediction dressed as a measurement.**
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
| P-06 | **PII** | inbox, contacts, communications; also deletes the second `getCurrentUserId`, which writes rows under the literal string `'default-user'` |
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
| 1 | P-00 coordinator | *pending* | *pending* | 67 | 319/320 | 5267/5268 | 16/16 | **none** | 2026-09-09 |

---

## STATUS

**P-16 and P-17 are quarantined.** They implement Sprint 5 (issue #24, 14
deliverables) and Sprint 6 (issue #25, 20 deliverables), both of which cite
`PAF-Shadow-MEGA-Implementation-Claude-Code-Prompt.md` by line number. That file
is **not in this repository**, and it is not on this machine — it was authored in
a different session and lives at a path this environment cannot reach. **Commit
it before dispatching either package.** Sizing them from the issue bullets alone
would be inventing scope.

Everything else is unblocked the moment P-00 merges.
