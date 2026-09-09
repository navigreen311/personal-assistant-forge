# P-11 escalation — queue workers and deployment

Branch `feature/p-11-queue-workers`, branched from `origin/master` @ `4082be9`.

The package is complete: the workers run, they are in the deployment, and
`tests/db/queue-worker.test.ts` proves consumption against a real Postgres and a
real Redis. Nothing below blocks the merge. These are the things P-11 could not
fix inside its file list, plus what it found that the audit did not.

---

## 1. BLOCKED — `jest.db.config.ts` cannot load `uuid@13`

**Scope:** `jest.db.config.ts` is on P-11's must-not-touch list.

`uuid@13.0.0` is `"type": "module"` with no CommonJS build. Its `exports` map
resolves to `dist-node/index.js`, which begins `export { default as MAX } from
'./max.js'`. Both jest configs run ts-jest in CommonJS and transform only
`^.+\.tsx?$`, so anything under `node_modules` is handed to Node as-is.

The effect is not limited to this package. **Any test in this repository that
loads the real `src/modules/capture/services/capture-service.ts` dies at import
time** with:

```
SyntaxError: Unexpected token 'export'
  at Object.<anonymous> (src/modules/capture/services/capture-service.ts:6:1)
```

The existing `tests/unit/capture/capture-processor.test.ts` never hits it only
because it `jest.mock`s `capture-service` away entirely — which is why 5,265
green tests have never revealed that the capture module is untestable in its
real form. Worth noting alongside the audit's 186 `jest.mock('@/lib/db')` files:
this is the same failure mode a layer down.

**Workaround shipped:** `tests/db/queue-worker.test.ts` substitutes Node's own
`crypto.randomUUID` for `uuid.v4`. It is the same RFC-4122 v4 generator reached
through a CJS-loadable path — a module-format shim, not a behavioural mock — and
no assertion in the file depends on it.

**Fix a config-owning package should make**, one line in *both* jest configs:

```ts
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1',
  '^uuid$': require.resolve('uuid/dist/cjs/index.js'),   // or:
},
// alternatively:  transformIgnorePatterns: ['node_modules/(?!(uuid)/)']
```

Once that lands, the `jest.mock('uuid', ...)` block at the top of
`tests/db/queue-worker.test.ts` should be deleted; the suite passes without it.

---

## 2. FOUND — the cron scheduler has no producer either

Not in the audit, and only half of it was in P-11's card.

`src/lib/queue/scheduler.ts` enqueues repeatable `cron-trigger` jobs onto a
`workflow-cron` queue. The audit named three unstarted workers
(`createWorkflowWorker`, `createJobWorker`, `createCaptureWorker`) and missed
this queue completely — understandably, because unlike those three there was no
`createXWorker` symbol to notice was uncalled. **`workflow-cron` had no consumer
at all.** P-11 added `createCronWorker()` in `scheduler.ts` and starts it in
`scripts/worker.ts`; `tests/db/queue-worker.test.ts` proves a tick now produces a
`WorkflowExecutionRecord` and a real workflow run.

**The half P-11 could not fix:** `registerCronTrigger`, `unregisterCronTrigger`
and `getScheduledWorkflows` have **zero callers in `src/` or `tests/`**. Nothing
in the product ever registers a schedule. Creating or activating a workflow with
a cron trigger does not reach this module, so a user setting a schedule in the UI
gets no schedule. Wiring it means editing `src/modules/workflows/**`, which
belongs to P-09.

The queue now has a consumer and still has no producer. That is a strictly
better state than before — the consumer is the half that cannot be added later
without a deploy — but the feature is not end-to-end until P-09 (or whoever owns
workflow activation) calls `registerCronTrigger`.

**Second-order issue for whoever does that wiring:** `activeSchedules` at
`scheduler.ts:31` is a module-level `Map`. `unregisterCronTrigger` returns early
when the Map has no entry, so after any restart the repeatable job still exists
in Redis while the process no longer knows about it — and a schedule can then
never be removed. It is harmless today because nothing registers. The moment a
producer is wired it becomes a live leak, and now that a consumer exists it is a
leak that *fires workflows on a schedule nobody can cancel*. The durable source
of truth is `getSchedulerQueue().getRepeatableJobs()`; the Map should not gate
the lookup. P-11 left it alone because fixing an unreachable path in a package
about starting workers is the wrong trade, and the fix belongs with the wiring.

---

## 3. FOUND — two queues have no durable side effect to observe

Relevant to anyone who tries to extend `tests/db/queue-worker.test.ts`.

- **`capture-queue`.** `createCaptureWorker` calls
  `captureService.createCapture()` / `processCapture()`, and `CaptureService`
  stores every capture in `private captures = new Map<string, CaptureItem>()`
  (`capture-service.ts:18`). It never touches Prisma. The capture worker is
  started by `scripts/worker.ts` and does consume, but **there is no database
  row a test can assert on**, so the suite covers it only through the
  worker-set assertion. A restart drops every in-flight capture, and
  `processCapture` on a capture created before the restart throws
  `Capture "<id>" not found` — which reads as a missing record rather than as
  data loss.

- **`workflow-execution` partially.** `workflow-executor.ts` keeps its
  `executionStore` in memory too, so the `WorkflowExecutionRecord` model added
  by P-00 is written by P-11's cron worker and by nobody else. The workflow
  worker in `workflow-worker.ts` writes `ActionLog` rows and stamps
  `Workflow.lastRun` (both asserted in the suite) but never updates the
  execution record's status — a run started by cron stays `PENDING` forever.

Both look like T-007 in-memory-store work that belongs to P-09/P-13 rather than
to P-11, which may not touch `src/modules/**`.

---

## 4. NOTE — `package-lock.json` changed

P-11's card scopes `package.json` to the `"worker"` script line plus a
devDependency. Adding `tsx` necessarily updates `package-lock.json` as well, or
`npm ci` fails in every CI job. The lockfile diff is `tsx` and its transitive
deps only. `package.json`'s diff is exactly two lines — npm's reordering of
`html2canvas` was reverted by hand.
