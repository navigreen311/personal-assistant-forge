/**
 * P-11 (T-006) — the worker process.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * `createWorkflowWorker()`, `createJobWorker()` and `createCaptureWorker()`
 * were written, exported, typed and unit-tested, and never called. Nothing in
 * this repository constructed a BullMQ Worker. `package.json` declared
 * `"worker": "node scripts/worker.js"` pointing at a file that did not exist,
 * and the Dockerfile's only CMD was `node server.js`.
 *
 * The consequence is not that async work was slow. It is that async work never
 * happened at all, silently and with a 200 response: `POST /api/workflows/[id]/
 * trigger` enqueues, returns success, and the job sits in Redis forever. It is
 * never retried, because retry only happens after a consumer fails it; it is
 * never dead-lettered, because that too requires a consumer; it never times
 * out, because BullMQ's `stalled` detection is run BY a worker. The three
 * attempts and exponential backoff configured in `jobs/index.ts` and
 * `workflow-queue.ts` had, before this file, never once executed.
 *
 * This process is the consumer. It is the whole of the fix; everything else in
 * the package is deployment and proof.
 *
 * ============================================================================
 * WHY TYPESCRIPT, AND WHY `node --import tsx`
 * ============================================================================
 *
 * The declared script was `node scripts/worker.js`. A hand-written .js
 * entrypoint cannot import this codebase: every module it needs is .ts, uses
 * the `@/*` path alias, and is only ever compiled by Next's bundler, which does
 * not emit a standalone build of `src/lib/queue`. Writing the entrypoint in
 * plain JS would mean either duplicating the workers in JS (two copies to keep
 * in step, and the copy that runs is the one no test covers) or adding a second
 * tsconfig and build output. So the script value changed to
 * `node --import tsx scripts/worker.ts` — the one line in package.json P-11 was
 * scoped to change.
 *
 * `node --import tsx` rather than the `tsx` CLI on purpose. The CLI spawns a
 * child node process and forwards signals to it; `--import` registers the
 * loader in-process, so this file's own SIGTERM handler is the first and only
 * thing that receives the container's stop signal. Graceful shutdown is the
 * point of the next section, and a signal that has to survive a hop through a
 * supervising parent is a graceful shutdown with a failure mode.
 *
 * `tsx` is a devDependency, so the Docker worker stage runs on the builder's
 * full node_modules rather than the pruned production tree. See the Dockerfile.
 *
 * ============================================================================
 * SHUTDOWN
 * ============================================================================
 *
 * `worker.close()` stops the worker taking new jobs and waits for in-flight
 * ones to finish. Skipping it does not merely lose the jobs in flight: BullMQ
 * leaves them in the `active` set holding a lock, and they are only recovered
 * when a later worker's stalled-job check expires that lock — up to 30 seconds
 * of nothing, per restart, per job. A container that cannot be stopped cleanly
 * makes every deploy a small outage.
 *
 * A `FORCE_EXIT_MS` deadline backs it up: if a job wedges, the process still
 * exits (non-zero, so the orchestrator sees an unclean stop) rather than
 * hanging until Kubernetes or Compose SIGKILLs it.
 */

import type { Worker } from 'bullmq';
import { prisma } from '@/lib/db';
import { createJobWorker } from '@/lib/queue/jobs/registry';
import { createCronWorker } from '@/lib/queue/scheduler';
import { createWorkflowWorker } from '@/lib/queue/workflow-worker';
import { createCaptureWorker } from '@/modules/capture/services/capture-processor';

/** How long a graceful shutdown may take before the process exits anyway. */
const FORCE_EXIT_MS = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 30_000);

/** Concurrency per worker. One knob, because they share one Redis and one pool. */
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);

interface NamedWorker {
  name: string;
  worker: Worker;
}

/**
 * Build every worker in the platform.
 *
 * Exported so a test can start the same set the container starts, rather than
 * asserting against a hand-rolled worker that happens to agree with this file.
 */
export function createAllWorkers(): NamedWorker[] {
  return [
    { name: 'workflow-execution', worker: createWorkflowWorker() },
    { name: 'pa-forge-jobs', worker: createJobWorker(CONCURRENCY) },
    { name: 'capture-queue', worker: createCaptureWorker({ concurrency: CONCURRENCY }) },
    { name: 'workflow-cron', worker: createCronWorker() },
  ];
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  console.log(`[worker] starting; redis=${redisUrl} concurrency=${CONCURRENCY}`);

  const workers = createAllWorkers();

  for (const { name, worker } of workers) {
    // A Worker emits 'error' for connection-level problems. Unhandled, an
    // EventEmitter 'error' terminates the process — which would make a Redis
    // blip look like a crash loop rather than a reconnect.
    worker.on('error', (err: Error) => {
      console.error(`[worker:${name}] error:`, err.message);
    });
    console.log(`[worker] listening on queue "${name}"`);
  }

  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    if (shuttingDown) {
      console.warn(`[worker] ${signal} received during shutdown; ignoring`);
      return;
    }
    shuttingDown = true;
    console.log(`[worker] ${signal} received; draining ${workers.length} workers`);

    const forceExit = setTimeout(() => {
      console.error(`[worker] shutdown exceeded ${FORCE_EXIT_MS}ms; forcing exit`);
      process.exit(1);
    }, FORCE_EXIT_MS);
    // Do not let the deadline itself hold the event loop open.
    forceExit.unref();

    try {
      await Promise.all(
        workers.map(async ({ name, worker }) => {
          await worker.close();
          console.log(`[worker] closed "${name}"`);
        })
      );
      await prisma.$disconnect();
      clearTimeout(forceExit);
      console.log(`[worker] shutdown complete; exiting ${exitCode}`);
      process.exit(exitCode);
    } catch (err) {
      clearTimeout(forceExit);
      console.error('[worker] shutdown failed:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.on('SIGINT', () => void shutdown('SIGINT', 0));

  // A rejection nobody handled has already left some job in an unknown state.
  // Exiting non-zero lets the orchestrator restart into a known one; staying up
  // means the next few hundred jobs run against whatever that state is.
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandled rejection:', reason);
    void shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaught exception:', err);
    void shutdown('uncaughtException', 1);
  });

  console.log('[worker] ready');
}

// Run only when node was pointed at THIS file. Without the guard, a test that
// imports `createAllWorkers` would also start a process that never exits.
// `process.argv[1]` is this path under `node --import tsx scripts/worker.ts`,
// and the jest binary under the test runner.
const entry = process.argv[1] ?? '';
const invokedDirectly = /[\\/]scripts[\\/]worker\.(ts|js|mjs)$/.test(entry);

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error('[worker] fatal:', err);
    process.exit(1);
  });
}
