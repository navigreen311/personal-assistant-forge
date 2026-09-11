/**
 * P-11 (T-006) — the async layer, executed.
 *
 * ============================================================================
 * WHAT THIS FILE IS FOR
 * ============================================================================
 *
 * Before this package, no BullMQ Worker was ever constructed in this
 * repository. `createWorkflowWorker`, `createJobWorker` and
 * `createCaptureWorker` were exported and never called; `package.json` pointed
 * `npm run worker` at `scripts/worker.js`, which did not exist; the Dockerfile
 * ran `node server.js` and nothing else. Every enqueue in the product landed in
 * Redis and stayed there.
 *
 * There were already unit tests for the queue. They passed. They asserted that
 * `enqueueJob` returns a job id, that the processor map has an entry per
 * JobType, that `createJobWorker` returns a Worker — all true, all true before
 * this package, and none of it distinguishable from a platform where async work
 * never runs. That is the shape this suite exists to break: **enqueueing was
 * never the thing that was broken.** Consumption was.
 *
 * So no assertion here is about the queue. Every assertion is about a row in
 * Postgres that only exists because a worker picked a job off Redis and ran the
 * product's own processor against a real database.
 *
 * ============================================================================
 * HOW TO CHECK THIS TEST IS HONEST
 * ============================================================================
 *
 * Comment out the `workers = createAllWorkers()` line in `beforeAll`. Every
 * test in the first describe must fail on the `waitFor` deadline — because the
 * jobs are still enqueued, the queue still accepts them, and nothing else in
 * the system has changed. If a test still passes with no worker running, that
 * test is measuring the enqueue and should be deleted.
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * A real Postgres (see tests/helpers/db.ts) and a real Redis. There is no
 * fallback and no skip: a queue test that quietly passes when the queue is
 * absent is exactly the decoration this package was opened to remove.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_dbtest \
 *   REDIS_URL=redis://127.0.0.1:6379 \
 *     npm run test:db
 */

// ---------------------------------------------------------------------------
// The one shim in this file, and what it is not
// ---------------------------------------------------------------------------
//
// `uuid@13` is pure ESM: its package `exports` resolve to `dist-node/index.js`,
// which is `export { ... }`. Jest here runs ts-jest in CJS and transforms only
// `.tsx?`, so *any* test that loads the real `capture-service` — and therefore
// the real capture worker, and therefore `scripts/worker.ts` — dies on
// `SyntaxError: Unexpected token 'export'` before a single assertion runs. The
// existing unit test at tests/unit/capture/capture-processor.test.ts never hits
// this because it mocks `capture-service` away wholesale.
//
// The correct fix is one line of `moduleNameMapper` (or
// `transformIgnorePatterns`) in jest.db.config.ts, which P-11 is not permitted
// to edit. See PARALLEL_BUILD_ESCALATION_P11.md.
//
// So this substitutes `crypto.randomUUID` for `uuid.v4` — the same RFC-4122 v4
// generator from Node's own standard library, reached through a path CJS can
// load. Nothing about the queue, the workers, the processors or the database is
// stubbed: this is a module-format shim, not a behavioural mock, and no
// assertion in this file depends on it.
jest.mock('uuid', () => {
  const { randomUUID } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { v4: (): string => randomUUID() };
});

import IORedis from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { db, setupTestDatabase } from '../helpers/db';
import { createEntity, createUser } from '../helpers/factories';
import { createAllWorkers } from '../../scripts/worker';
import { JobType } from '@/lib/queue/jobs';
import { enqueueJob, getJobQueue } from '@/lib/queue/jobs/registry';
import { getSchedulerQueue } from '@/lib/queue/scheduler';
// P-27: `createAllWorkers` now starts a consumer for this queue too, so a job
// another test file left in it would be processed against a truncated database.
import { getDomainEventQueue } from '@/lib/queue/domain-events';
import { enqueueWorkflowExecution, getQueue } from '@/lib/queue/workflow-queue';
import type { WorkflowGraph } from '@/modules/workflows/types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Prove Redis is there before anything asserts on it.
 *
 * Without this the first failure is a `waitFor` timeout, which reads as "the
 * worker did not consume" when the truth is "there was nothing to consume
 * from". BullMQ's default `maxRetriesPerRequest: null` means a missing Redis
 * retries forever rather than erroring, so this uses its own short-lived client
 * with a finite timeout.
 */
async function assertRedisReachable(): Promise<void> {
  const probe = new IORedis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    const pong = await probe.ping();
    if (pong !== 'PONG') {
      throw new Error(`Redis at ${REDIS_URL} did not answer PING (got ${pong})`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `tests/db/queue-worker.test.ts requires a real Redis at ${REDIS_URL}, and ` +
        `could not reach one: ${message}\n` +
        'This suite proves a BullMQ worker consumes jobs; there is deliberately ' +
        'no in-memory fallback and no skip. Start Redis (locally: Memurai on ' +
        '127.0.0.1:6379) or set REDIS_URL.'
    );
  } finally {
    probe.disconnect();
  }
}

/**
 * Poll until `predicate` returns a truthy value, or fail with a stated reason.
 *
 * Polling rather than `job.waitUntilFinished()` on purpose: "the job reached
 * the completed state" is a fact about Redis. What this suite must observe is
 * the row the processor wrote, so the wait condition is the row.
 */
async function waitFor<T>(
  what: string,
  predicate: () => Promise<T | null | undefined | false>,
  timeoutMs = 15_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last as T;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for: ${what}. ` +
      'If the workers are running, the processor either failed or wrote nothing.'
  );
}

/**
 * A two-node graph whose ACTION node has a REAL, observable effect.
 *
 * P-31. This fixture used to carry `actionType: 'CUSTOM'`, which no handler in
 * `action-handlers.ts` implements -- and that was fine, because the worker
 * dispatched no handler at all. It walked the graph writing one `ActionLog` row
 * per node saying EXECUTED, so a node naming an action type that does not exist
 * produced exactly the same rows as one naming an action type that does. The
 * fixture could not tell the difference and neither could the assertion.
 *
 * `CREATE_TASK` writes a `Task` row. That row is not something a logger can
 * produce, which is the entire point of asking for it.
 */
function twoNodeGraph(entityId: string, title: string): WorkflowGraph {
  return {
    nodes: [
      {
        id: 'node-start',
        type: 'TRIGGER',
        label: 'Start',
        config: { nodeType: 'TRIGGER', triggerType: 'MANUAL', config: {} },
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: ['out'],
      },
      {
        id: 'node-action',
        type: 'ACTION',
        label: 'Do the thing',
        config: {
          nodeType: 'ACTION',
          actionType: 'CREATE_TASK',
          parameters: { title, entityId, priority: 'P2' },
        },
        position: { x: 200, y: 0 },
        inputs: ['in'],
        outputs: [],
      },
    ],
    edges: [{ id: 'edge-1', sourceNodeId: 'node-start', targetNodeId: 'node-action' }],
  } as unknown as WorkflowGraph;
}

/**
 * The same graph with an ACTION type no handler implements.
 *
 * Kept deliberately (P-31): the old fixture's `CUSTOM` action was an accident
 * that proved nothing, and it becomes evidence the moment a real dispatcher is
 * on the other end -- `getActionHandler` throws for it, so this is the fixture
 * that asks what the worker writes down when a node FAILS.
 */
function graphWhoseActionCannotRun(): WorkflowGraph {
  return {
    nodes: [
      {
        id: 'node-start',
        type: 'TRIGGER',
        label: 'Start',
        config: { nodeType: 'TRIGGER', triggerType: 'MANUAL', config: {} },
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: ['out'],
      },
      {
        id: 'node-action',
        type: 'ACTION',
        label: 'Do a thing nothing implements',
        config: { nodeType: 'ACTION', actionType: 'CUSTOM', parameters: {} },
        position: { x: 200, y: 0 },
        inputs: ['in'],
        outputs: [],
      },
    ],
    edges: [{ id: 'edge-1', sourceNodeId: 'node-start', targetNodeId: 'node-action' }],
  } as unknown as WorkflowGraph;
}

async function createActiveWorkflow(
  graph?: WorkflowGraph
): Promise<{ id: string; entityId: string }> {
  const user = await createUser();
  const entity = await createEntity(user.id);
  const workflow = await db.workflow.create({
    data: {
      name: 'P-11 consumed workflow',
      entityId: entity.id,
      status: 'ACTIVE',
      triggers: [],
      steps: (graph ?? twoNodeGraph(entity.id, 'created by the queue')) as unknown as object,
    },
  });
  return { id: workflow.id, entityId: entity.id };
}

/**
 * A run row, written the way the only real producer writes one.
 *
 * P-31. Every test in this file used to enqueue an INVENTED execution id --
 * `exec-${Date.now()}` -- for which no `WorkflowExecutionRecord` existed, and
 * the assertions passed. They could only pass because the worker never read
 * that table: it took the id, interpolated it into a `target` string, and left
 * the row it named (which did not exist) alone. A worker that actually runs the
 * run it was handed cannot accept an id for a run that was never created, so
 * this mirrors `processCronTriggerJob`: the record first, then the job.
 */
async function createPendingExecution(workflowId: string): Promise<string> {
  const record = await db.workflowExecutionRecord.create({
    data: {
      workflowId,
      status: 'PENDING',
      triggeredBy: 'SYSTEM',
      triggerType: 'CRON',
      variables: {},
    },
  });
  return record.id;
}

// ---------------------------------------------------------------------------

describe('queue workers actually consume', () => {
  setupTestDatabase();

  let workers: { name: string; worker: Worker }[] = [];
  let queues: Queue[] = [];

  beforeAll(async () => {
    await assertRedisReachable();

    // Redis is durable and shared between runs. A job left over from a previous
    // run would be consumed by these workers against a database that has since
    // been truncated, producing failures that belong to nobody. Start clean.
    queues = [getQueue(), getJobQueue(), getSchedulerQueue(), getDomainEventQueue()];
    for (const queue of queues) {
      await queue.obliterate({ force: true });
    }

    // The same workers the container starts. Asserting against a hand-rolled
    // worker would prove that a worker can consume, not that THIS deployment's
    // workers do.
    workers = createAllWorkers();
  }, 30_000);

  afterAll(async () => {
    await Promise.all(workers.map(({ worker }) => worker.close()));
    for (const queue of queues) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  }, 30_000);

  it('starts every queue the platform enqueues into', () => {
    // A worker set that silently drops a queue is the original bug in
    // miniature, so the names are asserted rather than the count.
    expect(workers.map((w) => w.name).sort()).toEqual([
      'capture-queue',
      // P-27 (T-036): the consumer that turns a domain change into a workflow
      // run. Added here at the same time as `createAllWorkers` learned about
      // it, which is the point of asserting the names -- P-11 found four
      // workers that were written, exported and never constructed, and this
      // list is what stops that happening a fifth time.
      'domain-events',
      'pa-forge-jobs',
      // P-16 (Sprint 5): the Shadow proactive sweep. Its repeatable is
      // registered by `ensureProactiveSchedule()` from `main()` in
      // scripts/worker.ts; without a consumer in this list that repeat would
      // fire every five minutes into nothing, which is P-11 finding 1 exactly.
      'shadow-proactive',
      'workflow-cron',
      'workflow-execution',
    ]);
  });

  it('runs an enqueued workflow execution -- the ACTION node reaches Postgres', async () => {
    // P-31. WHAT THIS ASSERTED BEFORE, AND WHY IT PASSED ANYWAY.
    //
    // It enqueued an invented execution id, waited for two `ActionLog` rows,
    // and asserted `WORKFLOW_STEP_TRIGGER` / `WORKFLOW_STEP_ACTION` with
    // `status: 'EXECUTED'`. Every one of those assertions was true of a worker
    // that dispatched no handler, touched no execution record, and ran nothing
    // -- because all three are facts about the logger, not about the run. The
    // graph's ACTION node named an action type no handler implements and the
    // test could not tell.
    //
    // What is asserted now is the TASK ROW. `handleCreateTask` is the only
    // thing in this platform that writes one, `executeNode` is the only thing
    // that calls it, and neither is reachable unless a worker took this job off
    // Redis and put it through the real executor.
    const workflow = await createActiveWorkflow();
    const executionId = await createPendingExecution(workflow.id);

    expect(await db.actionLog.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
    expect((await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } })).lastRun).toBeNull();

    await enqueueWorkflowExecution(executionId, workflow.id, {});

    // THE EFFECT. Not a row that says a step ran: the row the step created.
    const task = await waitFor('the task the ACTION node creates', async () =>
      db.task.findFirst({ where: { title: 'created by the queue' } })
    );
    expect(task.entityId).toBe(workflow.entityId);
    expect(task.priority).toBe('P2');

    // THE RUN REACHED A TERMINAL STATE. The record the producer wrote is the
    // one that finished -- a second row would mean the worker started its own
    // run and stranded this one, which is precisely what calling
    // `executeWorkflow` from the worker would have done.
    const record = await waitFor('the execution record to reach COMPLETED', async () => {
      const row = await db.workflowExecutionRecord.findUniqueOrThrow({ where: { id: executionId } });
      return row.status === 'COMPLETED' ? row : null;
    });
    expect(record.completedAt).toBeInstanceOf(Date);
    expect(record.error).toBeNull();
    expect(await db.workflowExecutionRecord.count()).toBe(1);

    // The run recorded what each node produced, in order, on its own row.
    const steps = record.stepResults as { nodeId: string; status: string }[];
    expect(steps.map((s) => `${s.nodeId}:${s.status}`)).toEqual([
      'node-start:COMPLETED',
      'node-action:COMPLETED',
    ]);

    // And the audit trail, which is now DERIVED from those results rather than
    // written ahead of them: the handler's own CREATE_TASK row, plus one step
    // row per node the worker ran.
    const logs = await db.actionLog.findMany({ orderBy: { timestamp: 'asc' } });
    expect(logs.map((l) => l.actionType).sort()).toEqual([
      'CREATE_TASK',
      'WORKFLOW_STEP_COMPLETED',
      'WORKFLOW_STEP_COMPLETED',
    ]);
    expect(logs.every((l) => l.actor === 'SYSTEM')).toBe(true);

    // ...and the worker's final write, which is not an audit row.
    const after = await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } });
    expect(after.lastRun).toBeInstanceOf(Date);
  });

  it('records a node that FAILED as failed, and does not report it EXECUTED', async () => {
    // P-31, the assertion the old shape made impossible. `status: 'EXECUTED'`
    // was a literal in the worker's `ActionLog.create`, so a node that could
    // not run logged the same word as a node that did. Here the ACTION names an
    // action type `getActionHandler` throws for.
    const workflow = await createActiveWorkflow(graphWhoseActionCannotRun());
    const executionId = await createPendingExecution(workflow.id);

    await enqueueWorkflowExecution(executionId, workflow.id, {});

    const record = await waitFor('the execution record to reach FAILED', async () => {
      const row = await db.workflowExecutionRecord.findUniqueOrThrow({ where: { id: executionId } });
      return row.status === 'FAILED' ? row : null;
    });
    expect(record.error).toContain('No handler registered for action type: CUSTOM');
    expect(record.completedAt).toBeInstanceOf(Date);

    const logs = await db.actionLog.findMany({ orderBy: { timestamp: 'asc' } });
    expect(logs.map((l) => `${l.actionType}/${l.status}`)).toEqual([
      'WORKFLOW_STEP_COMPLETED/EXECUTED',
      'WORKFLOW_STEP_FAILED/FAILED',
    ]);
    // A failed step is not reversible and carries no rollback path, so
    // `rollbackExecution` -- which selects on EXECUTED + reversible -- cannot
    // try to undo something that never happened.
    const failed = logs[1];
    expect(failed.reversible).toBe(false);
    expect(failed.rollbackPath).toBeNull();
  }, 30_000);

  it('runs an enqueued BACKUP_RUN job through the shared job worker', async () => {
    const user = await createUser();
    const entity = await createEntity(user.id);

    const jobId = await enqueueJob(JobType.BACKUP_RUN, {
      entityId: entity.id,
      scope: 'FULL',
      destination: 's3://paf-backups/p11',
    });
    expect(jobId).toBeTruthy();

    const log = await waitFor('the BACKUP_RUN audit row', async () =>
      db.actionLog.findFirst({ where: { actionType: 'BACKUP_RUN' } })
    );

    expect(log.target).toBe(`entity:${entity.id}/backup:FULL`);
    expect(log.reason).toBe('FULL backup to s3://paf-backups/p11');
    expect(log.reversible).toBe(false);
  });

  it('turns a cron tick into a durable execution record and a real workflow run', async () => {
    // `registerCronTrigger` has always been able to schedule this job. Nothing
    // has ever read the `workflow-cron` queue until now.
    const workflow = await createActiveWorkflow();

    await getSchedulerQueue().add('cron-trigger', { workflowId: workflow.id });

    const record = await waitFor('a WorkflowExecutionRecord created by the cron tick', async () =>
      db.workflowExecutionRecord.findFirst({ where: { workflowId: workflow.id } })
    );

    expect(record.triggerType).toBe('CRON');
    expect(record.triggeredBy).toBe('SYSTEM');

    // The tick hands off to `workflow-execution`, so the run must complete too.
    const after = await waitFor('the cron-triggered run to reach the workflow worker', async () => {
      const row = await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } });
      return row.lastRun ? row : null;
    });
    expect(after.lastRun).toBeInstanceOf(Date);

    // P-31. "Reached the workflow worker" was as far as this could go: the
    // worker stamped `lastRun` and left the row it had just been handed
    // PENDING forever, so the tick's own record never reached a terminal state
    // and the workflow's ACTION node never ran. Both are asserted now, and the
    // second one is a row only `handleCreateTask` can write.
    const finished = await waitFor('the cron tick own record to reach COMPLETED', async () => {
      const row = await db.workflowExecutionRecord.findUniqueOrThrow({ where: { id: record.id } });
      return row.status === 'COMPLETED' ? row : null;
    });
    expect(finished.completedAt).toBeInstanceOf(Date);
    expect(await db.task.findFirst({ where: { title: 'created by the queue' } })).not.toBeNull();
  });

  it('does not start a run for a workflow that is not ACTIVE', async () => {
    const user = await createUser();
    const entity = await createEntity(user.id);
    const draft = await db.workflow.create({
      data: {
        name: 'still a draft',
        entityId: entity.id,
        status: 'DRAFT',
        triggers: [],
        steps: twoNodeGraph(entity.id, 'a draft must never create this') as unknown as object,
      },
    });

    const job = await getSchedulerQueue().add('cron-trigger', { workflowId: draft.id });

    await waitFor('the cron job to finish', async () =>
      (await job.getState()) === 'completed' ? true : null
    );

    // The tick ran and decided not to. That is a different outcome from the tick
    // never running, and only one of the two leaves the table empty AND the job
    // completed.
    expect(await db.workflowExecutionRecord.count()).toBe(0);
    expect((await db.workflow.findUniqueOrThrow({ where: { id: draft.id } })).lastRun).toBeNull();
    // P-31: and the effect the graph would have had. Before the worker
    // dispatched handlers, "the draft did not run" and "the draft ran and did
    // nothing, like every other workflow" left identical evidence.
    expect(await db.task.count()).toBe(0);
  });

  it('executes the retry policy that has never had a consumer to execute it', async () => {
    // `workflow-queue.ts` has configured `attempts: 3` with exponential backoff
    // since it was written. With no worker, a job is never attempted even once,
    // so the retry policy could not fail and could not be observed. Attempt
    // counting is a property of the consumer.
    const executionId = `exec-missing-${Date.now()}`;
    const jobId = await enqueueWorkflowExecution(executionId, 'no-such-workflow-id', {});

    const job = await waitFor(
      'the job to exhaust its three configured attempts',
      async () => {
        const found = await getQueue().getJob(jobId);
        if (!found) return null;
        return found.attemptsMade >= 3 ? found : null;
      },
      20_000
    );

    expect(job.attemptsMade).toBe(3);
    expect(await job.getState()).toBe('failed');
    expect(job.failedReason).toContain('Workflow no-such-workflow-id not found');
  }, 25_000);

  it('closes every worker cleanly, which is what SIGTERM in the container does', async () => {
    // Runs last on purpose: it shuts the shared workers down. `close()` waits
    // for in-flight jobs rather than abandoning them holding a Redis lock, and
    // it is idempotent, so afterAll closing them again is safe.
    await Promise.all(workers.map(({ worker }) => worker.close()));
    for (const { name, worker } of workers) {
      expect({ name, running: worker.isRunning() }).toEqual({ name, running: false });
    }
  }, 30_000);
});
