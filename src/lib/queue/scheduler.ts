// ============================================================================
// Cron-based Workflow Trigger Scheduler
// Uses BullMQ repeat/cron capability for recurring workflow triggers
// ============================================================================
//
// P-09, from P-11's findings 1 and 3.
//
// FINDING 1 -- `registerCronTrigger` had ZERO callers. P-11 built the consumer
// below; nothing anywhere produced a schedule for it to consume. A user who set
// a TIME trigger on a workflow got a stored trigger and no schedule, forever,
// with no error. `syncCronTriggers` is the producer, and `workflow-crud` calls
// it on every create and update.
//
// FINDING 3 -- `activeSchedules` was a module-level `Map` shadowing BullMQ's
// own repeat state. Redis owns that state and survives a restart; the Map did
// not. After a restart the repeatable job kept firing while the process had
// forgotten it existed, so `unregisterCronTrigger` found nothing to remove and
// the schedule could never be cancelled. The Map is gone. Both
// `unregisterCronTrigger` and `getScheduledWorkflows` read Redis, the actual
// source of truth. (The persistence pattern names this exact case: a mirror of
// an external source of truth is not persisted -- it is deleted, and the source
// is queried.)

// FINDING 3, THE SECOND TIME (P-41). The Map was gone and the Redis read was
// real, but it matched on `job.id` -- and on bullmq 5.81
// `Queue.getRepeatableJobs()` returns `{ key, name, endDate, tz, pattern,
// every, next }` with NO `id` FIELD AT ALL, because the repeat key is an md5
// hash of the job name and repeat options and BullMQ cannot parse an id back
// out of it. Verified here by dumping the array: a repeat registered by
// `queue.add(name, data, { repeat, jobId })` comes back keyed
// `7807b40ffe96f85015874ddcd99dcfa1`.
//
// So `unregisterCronTrigger`'s filter skipped EVERY entry and removed nothing:
// pausing or deleting an ACTIVE workflow left its repeat firing forever, with no
// error. `getScheduledWorkflows` parsed `workflowIdOfJob(job.id)` off the same
// absent field, so it reported an empty list while the repeats kept firing --
// P-17 called that "P-11's finding 3 in a new costume", and it is: the mirror
// was deleted and the source was then queried on a column it does not have.
//
// THE FIX IS NOT P-17's FIX, AND COULD NOT BE. `shadow-retention.ts` matches on
// `name`, which works there because that queue carries exactly one job name.
// `workflow-cron` carries ONE name (`cron-trigger`) for EVERY workflow, so a
// name match would make cancelling one workflow's schedule cancel all of them.
// The workflow id has to survive the round trip, so this file moves off the
// deprecated repeatable API onto JOB SCHEDULERS: `upsertJobScheduler(id, ...)`
// stores the schedule under an id WE choose, and `getJobSchedulers()` returns
// that id back as `key`. Three consequences worth stating:
//
//   - a schedule is now cancellable, because it is addressable;
//   - `upsertJobScheduler` REPLACES the schedule for an id it already holds, so
//     a changed cron pattern leaves exactly one schedule rather than two firing
//     side by side (the observable harm, and what the test asserts);
//   - `getJobSchedulers()` also returns the LEGACY hash-keyed repeats an
//     already-running deployment holds, and `removeJobScheduler(key)` removes
//     those too. They are attributed to their workflow through the pending
//     delayed job's `data.workflowId`, which is the only place the workflow id
//     survives for a legacy repeat -- so this fix cancels schedules registered
//     before it was deployed, which is the whole point of calling an
//     uncancellable schedule a leak.

import { Queue, Worker, type Job } from 'bullmq';
import { getRedisUrl } from './connection';
import { prisma } from '@/lib/db';
import { enqueueWorkflowExecution } from './workflow-queue';

const SCHEDULER_QUEUE_NAME = 'workflow-cron';

/** The one job name this queue carries. Not a discriminator between workflows. */
const CRON_TRIGGER_JOB_NAME = 'cron-trigger';

let schedulerQueue: Queue | null = null;

function getSchedulerQueue(): Queue {
  if (!schedulerQueue) {
    schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, {
      connection: { url: getRedisUrl() },
    });
  }
  return schedulerQueue;
}

interface ScheduledWorkflow {
  workflowId: string;
  cron: string;
  nextRun: Date;
}

/** The BullMQ job-scheduler id for one cron trigger of one workflow. */
function cronJobId(workflowId: string, index: number): string {
  return `cron-${workflowId}-${index}`;
}

/**
 * Does this scheduler id belong to this workflow?
 *
 * Matched on the exact id shape rather than `key.includes(workflowId)`: cuids
 * share prefixes, and a substring match would let removing one workflow's
 * schedule remove another's.
 */
function isSchedulerIdForWorkflow(schedulerId: string, workflowId: string): boolean {
  return (
    schedulerId === `cron-${workflowId}` ||
    schedulerId.startsWith(`cron-${workflowId}-`)
  );
}

function workflowIdOfSchedulerId(schedulerId: string): string | null {
  if (!schedulerId.startsWith('cron-')) return null;
  const rest = schedulerId.slice('cron-'.length);
  const lastDash = rest.lastIndexOf('-');
  // `cron-<workflowId>-<index>`; a legacy job is `cron-<workflowId>`.
  if (lastDash > 0 && /^\d+$/.test(rest.slice(lastDash + 1))) {
    return rest.slice(0, lastDash);
  }
  return rest || null;
}

/** One schedule Redis holds, with the workflow it belongs to resolved. */
interface OwnedSchedule {
  /** The scheduler key -- what `removeJobScheduler` takes. */
  key: string;
  workflowId: string;
  pattern: string;
  next?: number;
}

/**
 * Which workflow each hash-keyed LEGACY repeat belongs to.
 *
 * A legacy repeat's key is `md5(name + repeat options)`, so the workflow id is
 * nowhere in it. It IS in the pending delayed job the repeat has produced,
 * whose own id is `repeat:<repeatKey>:<nextMillis>` and whose `data` is the
 * `{ workflowId }` payload the schedule was registered with. That is the only
 * public path from a legacy repeat back to its workflow, and without it a
 * deployment's existing schedules stay uncancellable after this fix ships.
 */
async function legacyRepeatOwners(queue: Queue): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  for (const job of await queue.getJobs(['delayed'])) {
    const match = /^repeat:(.+):\d+$/.exec(job.id ?? '');
    if (!match) continue;
    const data: unknown = job.data;
    if (data && typeof data === 'object' && 'workflowId' in data) {
      const { workflowId } = data as { workflowId: unknown };
      if (typeof workflowId === 'string' && workflowId.length > 0) {
        owners.set(match[1], workflowId);
      }
    }
  }
  return owners;
}

/**
 * Every workflow cron schedule Redis holds, attributed to its workflow.
 *
 * Covers both shapes: the job schedulers this file registers now, whose `key`
 * IS the id it chose, and the legacy hash-keyed repeats an already-running
 * deployment is holding.
 */
async function ownedSchedules(queue: Queue): Promise<OwnedSchedule[]> {
  const schedulers = await queue.getJobSchedulers();

  const unattributed = schedulers.filter(
    (entry) => entry && workflowIdOfSchedulerId(entry.key) === null
  );
  const legacyOwners =
    unattributed.length > 0 ? await legacyRepeatOwners(queue) : new Map<string, string>();

  const out: OwnedSchedule[] = [];
  for (const entry of schedulers) {
    if (!entry) continue;
    const workflowId = workflowIdOfSchedulerId(entry.key) ?? legacyOwners.get(entry.key);
    if (!workflowId) continue;
    out.push({
      key: entry.key,
      workflowId,
      pattern: entry.pattern ?? '',
      ...(entry.next === undefined ? {} : { next: entry.next }),
    });
  }
  return out;
}

export async function registerCronTrigger(
  workflowId: string,
  cronExpression: string,
  index = 0
): Promise<void> {
  // `upsertJobScheduler`, not `add({ repeat })`: the id we pass is the key the
  // schedule is stored under and the key `getJobSchedulers()` returns, so the
  // schedule stays addressable. `add({ repeat })` hashes it and the schedule
  // becomes uncancellable.
  await getSchedulerQueue().upsertJobScheduler(
    cronJobId(workflowId, index),
    { pattern: cronExpression },
    { name: CRON_TRIGGER_JOB_NAME, data: { workflowId } }
  );
}

/**
 * Remove every cron schedule for a workflow.
 *
 * Reads Redis rather than a local Map, so it works on a schedule registered by
 * a process that has since restarted or exited -- which was finding 3. And it
 * matches on the SCHEDULER KEY rather than on `job.id`, which finding 3's fix
 * read and which `getRepeatableJobs()` does not return -- which was finding 3
 * the second time.
 */
export async function unregisterCronTrigger(workflowId: string): Promise<void> {
  const queue = getSchedulerQueue();
  for (const schedule of await ownedSchedules(queue)) {
    if (isSchedulerIdForWorkflow(schedule.key, workflowId)) {
      await queue.removeJobScheduler(schedule.key);
      continue;
    }
    // A legacy hash-keyed repeat for this workflow, registered before this fix
    // existed. `removeJobScheduler` takes the key it is stored under and
    // removes it whichever shape wrote it.
    if (schedule.workflowId === workflowId) {
      await queue.removeJobScheduler(schedule.key);
    }
  }
}

/**
 * The cron expressions a workflow's triggers ask for.
 *
 * `Workflow.triggers` is stored as `[{ type, config }]` by `workflow-crud`, but
 * older rows hold the bare `TriggerNodeConfig`. Both shapes are read, because a
 * schedule that silently does not exist is the failure being fixed here.
 */
export function cronExpressionsOf(triggers: unknown): string[] {
  if (!Array.isArray(triggers)) return [];

  const out: string[] = [];
  for (const entry of triggers) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const config =
      record.config && typeof record.config === 'object'
        ? (record.config as Record<string, unknown>)
        : record;

    const triggerType = config.triggerType ?? record.type;
    if (triggerType !== 'TIME') continue;

    const cron = config.cronExpression;
    if (typeof cron === 'string' && cron.trim().length > 0) {
      out.push(cron.trim());
    }
  }
  return out;
}

export interface CronSyncResult {
  /** Cron expressions now registered for this workflow. */
  registered: string[];
  /** True when an existing registration was removed. */
  cleared: boolean;
}

/**
 * Make Redis agree with what the workflow row says (P-11 finding 1).
 *
 * Called by `workflow-crud` after every create and update. A workflow with no
 * TIME trigger and no previous TIME trigger touches Redis not at all, so
 * scheduling is only a dependency for the workflows that actually asked to be
 * scheduled.
 *
 * Only ACTIVE workflows are registered: a DRAFT or PAUSED workflow keeps its
 * stored trigger and gets no repeat. (The consumer below refuses to run a
 * non-ACTIVE workflow as well -- two independent checks, because a stale
 * repeatable in Redis outliving a pause is exactly the kind of thing this file
 * has already been wrong about once.)
 */
export async function syncCronTriggers(
  workflowId: string,
  triggers: unknown,
  status: string,
  previousTriggers?: unknown
): Promise<CronSyncResult> {
  const wanted = status === 'ACTIVE' ? cronExpressionsOf(triggers) : [];
  const had = cronExpressionsOf(previousTriggers ?? triggers);

  if (wanted.length === 0 && had.length === 0) {
    // Nothing scheduled and nothing to unschedule: do not open a connection.
    return { registered: [], cleared: false };
  }

  await unregisterCronTrigger(workflowId);

  for (const [index, cron] of wanted.entries()) {
    await registerCronTrigger(workflowId, cron, index);
  }

  return { registered: wanted, cleared: wanted.length === 0 };
}

/**
 * Every workflow cron schedule Redis is currently holding.
 *
 * Async, and reading Redis: the original synchronous version answered from a
 * Map that a restart emptied, so it reported "no schedules" while the repeats
 * kept firing. Its replacement then parsed the workflow id out of `job.id`, a
 * field `getRepeatableJobs()` does not return, so it reported an EMPTY LIST
 * while the repeats kept firing -- the same lie by a different route. It now
 * reads the scheduler key, which is the id this file chose.
 */
export async function getScheduledWorkflows(): Promise<ScheduledWorkflow[]> {
  const schedules = await ownedSchedules(getSchedulerQueue());

  return schedules.map((schedule) => ({
    workflowId: schedule.workflowId,
    cron: schedule.pattern,
    nextRun: schedule.next ? new Date(schedule.next) : getNextCronRun(schedule.pattern),
  }));
}

function getNextCronRun(cronExpression: string): Date {
  // Simple approximation: return next minute for any cron expression
  // In production, use a cron parser library for accuracy
  const next = new Date();
  next.setMinutes(next.getMinutes() + 1);
  next.setSeconds(0);
  next.setMilliseconds(0);

  // Basic cron field parsing for common patterns
  const parts = cronExpression.split(' ');
  if (parts.length >= 5) {
    const [minute, hour] = parts;
    if (minute !== '*' && !isNaN(Number(minute))) {
      next.setMinutes(Number(minute));
    }
    if (hour !== '*' && !isNaN(Number(hour))) {
      next.setHours(Number(hour));
      if (next <= new Date()) {
        next.setDate(next.getDate() + 1);
      }
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// The consumer (P-11)
// ---------------------------------------------------------------------------
//
// `registerCronTrigger` above has been adding repeatable jobs to the
// `workflow-cron` queue since it was written, and nothing has ever read that
// queue. The audit named three unstarted workers (workflow, jobs, capture); it
// missed this queue entirely, because unlike those three there was no
// `createXWorker` to notice was uncalled. A repeat schedule with no consumer
// fires on time, forever, into nothing.
//
// What a cron tick means: start one run of the workflow. That is a durable
// `WorkflowExecutionRecord` row plus a job on the `workflow-execution` queue,
// which `createWorkflowWorker` consumes. The record is written BEFORE the
// enqueue so a crash between the two leaves a visible PENDING run rather than
// no evidence that the tick happened.

interface CronTriggerJobData {
  workflowId: string;
}

/**
 * Result of one cron tick, returned so it lands in the BullMQ job result and is
 * visible in job inspection without reading the database.
 */
export interface CronTriggerResult {
  triggered: boolean;
  workflowId: string;
  executionId?: string;
  reason?: string;
}

async function processCronTriggerJob(
  job: Job<CronTriggerJobData>
): Promise<CronTriggerResult> {
  const { workflowId } = job.data;

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });

  // A deleted workflow is not a failure worth retrying three times with
  // exponential backoff -- it will never start existing again. Report it and
  // let the tick complete.
  if (!workflow) {
    return { triggered: false, workflowId, reason: 'WORKFLOW_NOT_FOUND' };
  }

  // A paused or draft workflow keeps its schedule registered but must not run.
  if (workflow.status !== 'ACTIVE') {
    return { triggered: false, workflowId, reason: `WORKFLOW_${workflow.status}` };
  }

  const record = await prisma.workflowExecutionRecord.create({
    data: {
      workflowId,
      status: 'PENDING',
      triggeredBy: 'SYSTEM',
      triggerType: 'CRON',
      variables: {},
    },
  });

  await enqueueWorkflowExecution(record.id, workflowId, {});

  return { triggered: true, workflowId, executionId: record.id };
}

/**
 * The worker for the `workflow-cron` queue.
 *
 * Concurrency is deliberately low: a tick does two small writes and hands the
 * real work to `workflow-execution`, so there is nothing here worth
 * parallelising, and a low ceiling keeps a burst of overdue repeats from
 * opening a connection per workflow.
 */
export function createCronWorker(options?: { concurrency?: number }): Worker {
  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async (job: Job) => {
      if (job.name !== CRON_TRIGGER_JOB_NAME) {
        throw new Error(`Unknown scheduler job: ${job.name}`);
      }
      return processCronTriggerJob(job as Job<CronTriggerJobData>);
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: options?.concurrency ?? 2,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[cron-worker] ${job?.id ?? 'unknown'} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[cron-worker] Worker error:', err.message);
  });

  return worker;
}

export { getSchedulerQueue };
