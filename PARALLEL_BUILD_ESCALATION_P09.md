# P-09 escalation — Execution and Workflows

What P-09 deliberately did **not** do, and why. Nothing here is a surprise
discovered at the end; each item is a decision, with the reason it was made.

The package card asked for the tenancy and the control-plane stores first, and
for an honest list rather than four partial fixes. Both halves landed in full:
**all 28 routes** are scoped, and **all 7 stores** named on the card are on the
tables P-00 landed. This file is the rest.

---

## 1. P-11 finding 2 is NOT fixed: a cron-started run still ends PENDING

**Status: blocked on file ownership. Needs a coordinator decision.**

A cron tick writes a `WorkflowExecutionRecord` with `status: 'PENDING'` and
enqueues a job on `workflow-execution`. `createWorkflowWorker` in
`src/lib/queue/workflow-worker.ts` consumes that job, walks the graph, writes
`ActionLog` rows — and never touches the run record. So every scheduled run sits
at `PENDING` forever, and the run history shows a workflow that started and
never finished, whatever actually happened.

P-09 cannot fix it: the card allows `src/lib/queue/scheduler.ts` and explicitly
excludes the rest of `src/lib/queue/**` because P-11 had just landed the
workers. The fix is small and entirely inside `workflow-worker.ts`:
`processWorkflowJob` should set `RUNNING` on entry and `COMPLETED` / `FAILED`
with a `completedAt` on exit, scoped by `executionId`, which it already has in
`job.data`.

Note that the producer side IS done — `syncCronTriggers` is called on every
workflow create and update — so as of this PR a schedule really does fire, and
this is now a visible wrong status rather than a theoretical one. It got more
urgent, not less.

**Suggested owner:** whoever holds `src/lib/queue/**` next, or P-20.

---

## 2. Three in-memory stores in my modules that I did not persist

The card named seven and all seven are done. Three more `Map`s live in
`src/modules/workflows/`; none is on the card, and one of them matters.

| store | file | assessment |
|---|---|---|
| `integrationStore` | `workflows/services/integration-hub.ts:10` | **Persist this.** It holds `IntegrationConfig`, including a `credentials` record — OAuth tokens and API keys. Losing it on restart silently disconnects every integration, and there is no model for it in the frozen schema, so it needs the amendment window rather than a code change. |
| `agentRegistry` | `workflows/services/agent-orchestrator.ts:20` | Leave it. Agents are registered at boot from configuration; this is a lookup table, not state. It rebuilds itself. |
| `collaborations` | `workflows/services/agent-orchestrator.ts:21` | Borderline. It records handoffs between agents during one orchestration; nothing reads it after the orchestration ends, so today it is a scratchpad. If anything ever reports on agent handoffs it becomes a real store. |

`integrationStore` needs a model. The schema is frozen and P-09 may not add
one, so this is an amendment-window item, not something to slip in.

---

## 3. The policy engine is scoped at the route boundary only

`src/app/api/rules/**` is mine; `src/engines/policy/**` is not. So the four
rules routes verify the entity and pass a `VerifiedEntityId` down, but
`listRules({ entityId })`, `evaluateRules(context, entityId)` and
`updateRule(id, { entityId })` all still take a plain `string`.

That means the fix holds for every caller that goes through the API — which is
every caller today — but there is **no compile-time enforcement** inside the
policy engine. A future caller elsewhere in `src/` can pass an unverified id and
`tsc` will not complain. Threading `VerifiedEntityId` through
`src/engines/policy/**` is a small change and is the right one; it belongs to
whoever owns that directory.

Two related notes on `/api/rules`:

- A rule with `entityId = null` is a **platform** rule. This API can no longer
  create one (a POST is always stamped with the caller's entity) and can no
  longer edit or delete one (`PUT` and `DELETE` return 403 for a rule with no
  owner). Reads are still allowed, because a rule that binds you should be
  visible to you. If the product wants tenants to author platform-wide policy,
  that needs a real admin path, not the absence of a check.
- `GET /api/rules/:id/audit` proves ownership of the rule and then returns
  `ActionLog` rows matched by `reason`/`target` containing the rule id. Those
  rows still have no entity of their own (see item 5).

---

## 4. Two numbers on `/api/execution/stats` are structurally zero

The route used to query `(prisma as any).actionQueue`, a delegate that has never
existed in the schema, with `safeCount` swallowing every throw. It returned a
confident row of zeroes for its whole life. It now queries `QueuedAction` with
no casts, and six of the eight numbers are real.

The other two have nowhere to come from:

- `avgConfidence` — `QueuedAction` has no confidence column.
- `simulatedToday` / the `?simulationMode=` filter — `QueuedAction` has no
  simulation flag, and simulations are not persisted at all (`simulateAction`
  computes and returns; nothing is written).

Both return `0`, and the route says so in a comment rather than deriving
something plausible from a field that means something else. If the dashboard
needs them, they are two columns and a decision about whether a dry run is
worth a row — an amendment-window question.

---

## 5. `ActionLog` has no tenant, and the timeline now fails closed

`ActionLog` has no `entityId` column and the schema is frozen. The old timeline
papered over that with `extractEntityId(target)`, which returned the target
string, so the "entity filter" compared `"tasks/abc"` against an entity id and
matched nothing. Every tenant's audit trail came back on a request with no
parameters at all.

The timeline is now built from the log rows reachable from **this tenant's
`QueuedAction` rows**, which carry both `actionLogId` and `entityId`. That is a
real key relationship rather than a string coincidence.

The consequence, stated plainly: **an `ActionLog` row that never went through
the action queue no longer appears on the timeline.** That includes the rows
`execution-logger.ts` writes for workflow steps and the ones
`approval-service.ts` writes for approval events. Failing closed is right for a
console whose only job is to show an operator what was done on their behalf —
showing another tenant's activity is a much worse failure than showing less of
your own — but it IS a visible reduction, and it is deliberate.

The durable fix is an `entityId` on `ActionLog`. That is a migration.

**Also, the `in` list:** the scope is expressed as `id: { in: [...] }` over the
tenant's log ids. For an entity with a very large queue history that list grows
unbounded. It is correct at any size and fine at the current one; it will want a
join (i.e. the column above) before it wants an index.

---

## 6. `getScheduledWorkflows()` became async

P-11 finding 3 said `activeSchedules` was a `Map` mirroring BullMQ's repeat
state, so a restart left a repeatable job firing in Redis that the process had
forgotten and could never cancel. The `Map` is gone and both
`unregisterCronTrigger` and `getScheduledWorkflows` read Redis, which owns that
state.

`getScheduledWorkflows` is therefore `async` now. It had **zero callers**, so
nothing broke — but anything built on it later must `await` it, and a sync call
site would fail as an unhandled rejection rather than a type error.

---

## 7. Runbook `tags` are stored in the `category` column

The `Runbook` interface has `tags: string[]`; the landed `Runbook` model has
`category: String`. The persistence pattern says to reconcile on the read side
rather than add a duplicate column, so `tags` are stored comma-joined in
`category` and split back out on read. The round trip is lossless, and the first
element is still the category in the column's documented sense
(`"incident"`, `"onboarding"`, …), so a query on `category` still means roughly
what it looks like.

The cost: **the `?tag=` filter on `GET /api/execution/runbooks` is applied in
memory, after the entity-scoped query**, not in SQL. A SQL `contains` would
match substrings (`"fin"` would match `"finance"`). The tenant scope is still in
the WHERE clause — the tag filter is a display filter, never a security
boundary — and runbook counts per entity are small. A `tags String[]` column
would make it a real query.

`lastRunStatus` has no column either, and is derived from the most recent
`RunbookExecution` row. That one is strictly better than a column: it was never
independent state, and storing it twice is how two copies come to disagree.

---

## 8. The plain-stash mutation could not produce per-case numbers

The tenancy pattern's §7 recipe is `git stash push`, run the new test against
the old code, `git stash pop`. That does not work for this package, and the PR
reports the surgical mutation instead. Two reasons:

1. Every service signature changed (they take a `VerifiedEntityId` now), so the
   new test does not compile against the old `src/` and ts-jest reports
   `Tests: 0` rather than a pass/fail split.
2. The old `simulation-engine.ts` imports `uuid`, which ships ESM only, so the
   suite cannot even load it — `jest.db.config.ts` is frozen and has no
   `transformIgnorePatterns`. (P-09 replaced that import with
   `node:crypto.randomUUID` for exactly this reason. Other modules still import
   `uuid`; any package that wants a `tests/db/` suite over them will hit the
   same wall.)

The surgical mutation removes only the tenant from the WHERE clauses and from
the `[id]` route scope resolvers, keeping every signature, so each case reports
individually. Numbers are in the PR body.

---

## 9. Small things left as they were, on purpose

- **`GET /api/execution/timeline/summary` defaults `to` to today at midnight,**
  so the default window excludes anything logged today. Pre-existing, unrelated
  to tenancy, and changing the default would move a number on a dashboard for
  reasons that have nothing to do with this package. The `tests/db/` case passes
  an explicit range and says why.
- **`POST /api/execution/costs` stays on `withAuth`.** An estimate is a pure
  function of an action type and its parameters: it reads no tenant data and
  touches no database, so there is no scope for it to be missing.
- **`approverId`, `triggeredBy`, `createdBy` and `actorId` are still accepted**
  in request bodies where they were before, and are ignored. Removing them from
  the schemas would 400 existing clients for no security benefit; the values are
  simply never used. Each is marked in place.
