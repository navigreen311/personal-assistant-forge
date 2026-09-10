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

import type { Job, Worker } from 'bullmq';
import { prisma } from '@/lib/db';
import { createJobWorker } from '@/lib/queue/jobs/registry';
import { createCronWorker } from '@/lib/queue/scheduler';
import { createWorkflowWorker } from '@/lib/queue/workflow-worker';
import { report, reportError } from '@/lib/observability/report';
import { startHeartbeat, reportWorkerShutdown } from '@/lib/observability/worker-health';
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

/**
 * P-28 (T-013/T-025) — attach reporting to one worker.
 *
 * Attached HERE and not inside the four `create*Worker` factories, deliberately.
 * Each factory already has its own `console.error` handlers, and one of them
 * lives under `src/modules/`; wiring in four places means four chances for the
 * fifth queue somebody adds next month to be wired in none. This function runs
 * over whatever `createAllWorkers()` returns, so a new queue is instrumented by
 * being in that list — the same reason `tests/helpers/routes.ts` reads the route
 * inventory off the filesystem instead of keeping a list.
 *
 * BullMQ's emitter allows multiple listeners, so the existing `console.error`
 * handlers keep running and nothing about current behaviour changes.
 */
function observeWorker(name: string, worker: Worker): void {
  // 'failed' fires on EVERY attempt, not only the last one. The distinction
  // matters: a job that failed once and succeeded on retry is the retry policy
  // working, and reporting it at the same severity as a job that exhausted its
  // attempts is how a metric becomes noise. Only the terminal failure — the job
  // that will never complete — is an error.
  worker.on('failed', (job: Job | undefined, err: Error) => {
    const attempts = job?.opts?.attempts ?? 1;
    const made = job?.attemptsMade ?? 0;
    const exhausted = made >= attempts;
    reportError(err, {
      kind: 'job_failed',
      severity: exhausted ? 'error' : 'warning',
      // Queue and job NAME only. A job id would give one counter row per job,
      // which is the high-cardinality mistake documented in types.ts.
      fingerprint: `job:${name}:${job?.name ?? 'unknown'}:${exhausted ? 'exhausted' : 'attempt'}`,
      message: exhausted
        ? `job exhausted ${attempts} attempts and will not complete`
        : 'job attempt failed and will be retried',
      context: { queue: name, jobName: job?.name ?? null, attemptsMade: made, attempts },
    });
  });

  // A stalled job is one a worker took and stopped reporting on: the process
  // died mid-job, or an event loop block outlasted the lock. It is the only
  // signal that distinguishes "the worker is slow" from "the worker is gone
  // and this job is being handed to someone else".
  worker.on('stalled', (jobId: string) => {
    report({
      kind: 'job_stalled',
      severity: 'error',
      message: 'job stalled; its lock expired before the worker reported back',
      fingerprint: `job:${name}:stalled`,
      context: { queue: name, jobId },
    });
  });

  // A Worker emits 'error' for connection-level problems. Unhandled, an
  // EventEmitter 'error' terminates the process — which would make a Redis
  // blip look like a crash loop rather than a reconnect.
  worker.on('error', (err: Error) => {
    console.error(`[worker:${name}] error:`, err.message);
    reportError(err, {
      kind: 'worker_error',
      severity: 'warning',
      fingerprint: `worker:${name}:error`,
      message: 'worker connection error',
      context: { queue: name },
    });
  });
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  console.log(`[worker] starting; redis=${redisUrl} concurrency=${CONCURRENCY}`);

  const workers = createAllWorkers();

  for (const { name, worker } of workers) {
    observeWorker(name, worker);
    console.log(`[worker] listening on queue "${name}"`);
  }

  // P-28: publish liveness so /api/health can answer "is anything consuming
  // the queues?". Before this, a worker container that OOMed looked identical
  // from the web tier to one running perfectly: `enqueue` returns 200 either
  // way. See src/lib/observability/worker-health.ts.
  const heartbeat = startHeartbeat(workers.map((w) => w.name));

  report({
    kind: 'manual',
    severity: 'warning',
    message: 'worker process started',
    fingerprint: 'lifecycle:worker-start',
    context: {
      queues: workers.map((w) => w.name).join(','),
      concurrency: CONCURRENCY,
      heartbeat: heartbeat !== null,
    },
  });

  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    if (shuttingDown) {
      console.warn(`[worker] ${signal} received during shutdown; ignoring`);
      return;
    }
    shuttingDown = true;
    console.log(`[worker] ${signal} received; draining ${workers.length} workers`);

    // P-28: recorded BEFORE draining, so the report exists even if the drain is
    // what hangs. A shutdown reported only on success is a shutdown you never
    // hear about in the one case you needed to.
    reportWorkerShutdown(signal, exitCode);

    const forceExit = setTimeout(() => {
      console.error(`[worker] shutdown exceeded ${FORCE_EXIT_MS}ms; forcing exit`);
      process.exit(1);
    }, FORCE_EXIT_MS);
    // Do not let the deadline itself hold the event loop open.
    forceExit.unref();

    try {
      // Deregister first: a worker that is on its way down should stop being
      // "expected" before it stops answering, or a rolling restart reports
      // itself as an outage. An UNCLEAN death skips this line, leaves the
      // registration in Redis, and is exactly what /api/health then reports as
      // down — which is the case worth alerting on.
      if (heartbeat) await heartbeat.stop();

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
  // P-28: reporting is added to these two handlers rather than to new ones.
  // Attaching a SECOND `uncaughtException` listener would be harmless, but
  // attaching a first one is not — a process with such a listener no longer
  // exits on an uncaught throw. These already exist and already own the
  // shutdown decision, so adding a `reportError` call changes nothing about
  // what happens next. `src/instrumentation.ts` cannot do the same for the web
  // process and uses `uncaughtExceptionMonitor` instead; the reasoning is
  // written out there.
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandled rejection:', reason);
    reportError(reason, {
      kind: 'worker_shutdown',
      severity: 'fatal',
      fingerprint: 'worker:unhandled-rejection',
      message: 'unhandled rejection in worker process',
    });
    void shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaught exception:', err);
    reportError(err, {
      kind: 'worker_shutdown',
      severity: 'fatal',
      fingerprint: 'worker:uncaught-exception',
      message: 'uncaught exception in worker process',
    });
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
