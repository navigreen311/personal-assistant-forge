// ============================================================================
// The Shadow proactive cron — queue, schedule and consumer
// ============================================================================
//
// P-16, deliverables 1-3. The card says: use the existing scheduling, do not
// build a second scheduler. This is the existing scheduling — BullMQ repeat,
// the same `getRedisUrl()` connection, a worker in the same
// `createAllWorkers()` list `scripts/worker.ts` starts and `/api/health`
// reports liveness for.
//
// It is a SEPARATE QUEUE from `workflow-cron` rather than another job name on
// it, for one reason worth stating: `createCronWorker` throws on any job whose
// name is not `cron-trigger`, and a throw in BullMQ is a retry with backoff.
// Adding a second job name to that queue would mean editing the one consumer
// that P-11 built to fix "a repeat schedule with no consumer", and getting it
// slightly wrong there fails workflow cron ticks, not Shadow ones. Two queues,
// two consumers, one shared scheduler mechanism.
//
// ----------------------------------------------------------------------------
// ONE REPEATABLE FOR THE WHOLE PLATFORM
// ----------------------------------------------------------------------------
//
// Not one per user. `proactive-runner.ts` has the full argument; the short
// version is that a repeatable per user is a copy of `briefingTime` living in
// Redis, and a copy of a settings column in Redis is precisely the mirror
// P-11 finding 3 removed from this same file's neighbour.
//
// The repeatable is registered by `ensureProactiveSchedule()`, which the worker
// process calls on boot. It is idempotent: the job id is fixed, so a restart
// re-registers the same id, and a changed cron pattern removes the old repeat
// first (BullMQ keys a repeatable by pattern as well as id, so without the
// removal a pattern change leaves BOTH schedules firing — the failure that
// makes "I changed the interval and it got twice as chatty" possible).

import { Queue, Worker, type Job } from 'bullmq';

import { getRedisUrl } from './connection';
import { runProactiveTick, type ProactiveTickResult } from '@/modules/shadow/proactive/proactive-runner';

export const SHADOW_PROACTIVE_QUEUE_NAME = 'shadow-proactive';
export const PROACTIVE_TICK_JOB_NAME = 'proactive-tick';

/**
 * The fixed id of the one repeatable.
 *
 * It is still passed as `jobId` so BullMQ keys the repeat by it and N replicas
 * registering produce one repeat. It is NOT what this module matches on when
 * reading the repeats back -- see `isOurRepeat`.
 */
const PROACTIVE_TICK_JOB_ID = 'shadow-proactive-tick';

/**
 * Is this repeat entry ours?
 *
 * P-41. Matched on `name`, NOT on `id`, and that is load-bearing. On bullmq
 * 5.81 `getRepeatableJobs()` returns entries shaped
 *
 *     { key, name, endDate, tz, pattern, every, next }
 *
 * with NO `id` field at all -- the repeat key is an md5 hash, so BullMQ cannot
 * parse the job id back out of it. Both functions below filtered
 * `if (job.id !== PROACTIVE_TICK_JOB_ID) continue`, which skipped EVERY entry,
 * which means:
 *
 *   - changing `SHADOW_PROACTIVE_CRON` left the old repeat in place and added
 *     the new one, so BOTH fired -- the exact failure this file's own header
 *     says it prevents, and the thing that makes "I changed the interval and it
 *     got twice as chatty" possible; and
 *   - `removeProactiveSchedule()` returned 0 and removed nothing while
 *     reporting success, so the sweep could not be turned off.
 *
 * This is character for character the fix P-17 shipped in the sibling file
 * `shadow-retention.ts`, whose `tests/db/shadow-retention.test.ts` proves it.
 * `name` is a sufficient discriminator because this queue carries exactly one
 * job name. `src/lib/queue/scheduler.ts` had the same defect and could NOT
 * take this fix: `workflow-cron` carries one name for every workflow, so a
 * name match there would cancel every workflow's schedule at once. See that
 * file's header for what it does instead.
 */
function isOurRepeat(job: { name?: string | null }): boolean {
  return job.name === PROACTIVE_TICK_JOB_NAME;
}

/**
 * How often the sweep runs.
 *
 * Five minutes is the resolution of every scheduled thing Shadow does: a
 * briefing configured for 08:00 is delivered somewhere in 08:00-08:05. A
 * minute-resolution tick would read every proactive config sixty times an hour
 * to deliver at most two things a day.
 */
export const PROACTIVE_TICK_CRON = process.env.SHADOW_PROACTIVE_CRON ?? '*/5 * * * *';

let proactiveQueue: Queue | null = null;

export function getShadowProactiveQueue(): Queue {
  if (!proactiveQueue) {
    proactiveQueue = new Queue(SHADOW_PROACTIVE_QUEUE_NAME, {
      connection: { url: getRedisUrl() },
    });
  }
  return proactiveQueue;
}

export interface ProactiveScheduleResult {
  cron: string;
  /** True when a previous repeat (a different pattern) was removed first. */
  replaced: boolean;
}

/**
 * Make Redis hold exactly one proactive repeat, on the current pattern.
 *
 * Safe to call on every boot of every worker replica: the job id is fixed, so
 * N replicas registering it produce one repeatable, not N.
 */
export async function ensureProactiveSchedule(
  cron: string = PROACTIVE_TICK_CRON
): Promise<ProactiveScheduleResult> {
  const queue = getShadowProactiveQueue();

  let replaced = false;
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    if (!isOurRepeat(job)) continue;
    if (job.pattern === cron) continue;
    await queue.removeRepeatableByKey(job.key);
    replaced = true;
  }

  await queue.add(
    PROACTIVE_TICK_JOB_NAME,
    {},
    { repeat: { pattern: cron }, jobId: PROACTIVE_TICK_JOB_ID },
  );

  return { cron, replaced };
}

/** Remove the proactive repeat. Used by tests and by an operator turning it off. */
export async function removeProactiveSchedule(): Promise<number> {
  const queue = getShadowProactiveQueue();
  let removed = 0;
  for (const job of await queue.getRepeatableJobs()) {
    if (!isOurRepeat(job)) continue;
    await queue.removeRepeatableByKey(job.key);
    removed += 1;
  }
  return removed;
}

/**
 * One tick.
 *
 * Exported so a test can drive the exact function the worker runs, rather than
 * a hand-rolled equivalent that happens to agree with it. The result is
 * returned so it lands in the BullMQ job result and a stuck sweep is visible in
 * job inspection without reading Postgres.
 */
export async function processProactiveTickJob(
  job: Job<{ userIds?: string[] }>,
): Promise<ProactiveTickResult> {
  return runProactiveTick({ userIds: job.data?.userIds });
}

/**
 * The consumer for the `shadow-proactive` queue.
 *
 * Concurrency 1 on purpose. The sweep is idempotent against concurrent runs —
 * every delivery is guarded by a count of the durable rows — but two
 * overlapping sweeps still do the same reads twice, and there is no throughput
 * to win: the work is a handful of queries per configured user, once every five
 * minutes.
 */
export function createShadowProactiveWorker(options?: { concurrency?: number }): Worker {
  const worker = new Worker(
    SHADOW_PROACTIVE_QUEUE_NAME,
    async (job: Job) => {
      if (job.name !== PROACTIVE_TICK_JOB_NAME) {
        throw new Error(`Unknown shadow-proactive job: ${job.name}`);
      }
      return processProactiveTickJob(job as Job<{ userIds?: string[] }>);
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: options?.concurrency ?? 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[shadow-proactive] ${job?.id ?? 'unknown'} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[shadow-proactive] Worker error:', err.message);
  });

  return worker;
}
