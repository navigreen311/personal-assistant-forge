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

/** A two-node graph: enough for the worker to walk an edge and log both nodes. */
function twoNodeGraph(): WorkflowGraph {
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
        config: { nodeType: 'ACTION', actionType: 'CUSTOM', parameters: {} },
        position: { x: 200, y: 0 },
        inputs: ['in'],
        outputs: [],
      },
    ],
    edges: [{ id: 'edge-1', sourceNodeId: 'node-start', targetNodeId: 'node-action' }],
  } as unknown as WorkflowGraph;
}

async function createActiveWorkflow(): Promise<{ id: string; entityId: string }> {
  const user = await createUser();
  const entity = await createEntity(user.id);
  const workflow = await db.workflow.create({
    data: {
      name: 'P-11 consumed workflow',
      entityId: entity.id,
      status: 'ACTIVE',
      triggers: [],
      steps: twoNodeGraph() as unknown as object,
    },
  });
  return { id: workflow.id, entityId: entity.id };
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
      'workflow-cron',
      'workflow-execution',
    ]);
  });

  it('runs an enqueued workflow execution and writes its audit trail to Postgres', async () => {
    const workflow = await createActiveWorkflow();
    const executionId = `exec-${Date.now()}`;

    expect(await db.actionLog.count()).toBe(0);
    expect((await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } })).lastRun).toBeNull();

    await enqueueWorkflowExecution(executionId, workflow.id, {});

    // The worker logs one ActionLog row per node it walks. Two nodes, two rows.
    const logs = await waitFor('two WORKFLOW_STEP rows from the workflow worker', async () => {
      const rows = await db.actionLog.findMany({
        where: { target: { contains: `execution:${executionId}` } },
        orderBy: { timestamp: 'asc' },
      });
      return rows.length >= 2 ? rows : null;
    });

    expect(logs.map((l) => l.actionType)).toEqual([
      'WORKFLOW_STEP_TRIGGER',
      'WORKFLOW_STEP_ACTION',
    ]);
    expect(logs.every((l) => l.actor === 'SYSTEM')).toBe(true);
    expect(logs.every((l) => l.status === 'EXECUTED')).toBe(true);

    // ...and the worker's final write, which is not an audit row.
    const after = await waitFor('workflow.lastRun to be stamped', async () => {
      const row = await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } });
      return row.lastRun ? row : null;
    });
    expect(after.lastRun).toBeInstanceOf(Date);
  });

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
        steps: twoNodeGraph() as unknown as object,
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
