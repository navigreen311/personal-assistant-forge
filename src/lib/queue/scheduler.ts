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

import { Queue, Worker, type Job } from 'bullmq';
import { getRedisUrl } from './connection';
import { prisma } from '@/lib/db';
import { enqueueWorkflowExecution } from './workflow-queue';

const SCHEDULER_QUEUE_NAME = 'workflow-cron';

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

/** The BullMQ job id for one cron trigger of one workflow. */
function cronJobId(workflowId: string, index: number): string {
  return `cron-${workflowId}-${index}`;
}

/**
 * Does this repeatable job belong to this workflow?
 *
 * Matched on the exact id shape rather than `key.includes(workflowId)`: cuids
 * share prefixes, and a substring match would let removing one workflow's
 * schedule remove another's.
 */
function isJobForWorkflow(
  job: { id?: string | null; key: string },
  workflowId: string
): boolean {
  const id = job.id ?? '';
  return (
    id === `cron-${workflowId}` || id.startsWith(`cron-${workflowId}-`)
  );
}

function workflowIdOfJob(job: { id?: string | null }): string | null {
  const id = job.id ?? '';
  if (!id.startsWith('cron-')) return null;
  const rest = id.slice('cron-'.length);
  const lastDash = rest.lastIndexOf('-');
  // `cron-<workflowId>-<index>`; a legacy job is `cron-<workflowId>`.
  if (lastDash > 0 && /^\d+$/.test(rest.slice(lastDash + 1))) {
    return rest.slice(0, lastDash);
  }
  return rest || null;
}

export async function registerCronTrigger(
  workflowId: string,
  cronExpression: string,
  index = 0
): Promise<void> {
  await getSchedulerQueue().add(
    'cron-trigger',
    { workflowId },
    {
      repeat: {
        pattern: cronExpression,
      },
      jobId: cronJobId(workflowId, index),
    }
  );
}

/**
 * Remove every cron schedule for a workflow.
 *
 * Reads the repeatable jobs out of Redis rather than a local Map, so it works
 * on a schedule registered by a process that has since restarted or exited --
 * which was the whole of finding 3.
 */
export async function unregisterCronTrigger(workflowId: string): Promise<void> {
  const queue = getSchedulerQueue();
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (isJobForWorkflow(job, workflowId)) {
      await queue.removeRepeatableByKey(job.key);
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
 * Async now, and reading Redis: the old synchronous version answered from a
 * Map that a restart emptied, so it reported "no schedules" while the repeats
 * kept firing.
 */
export async function getScheduledWorkflows(): Promise<ScheduledWorkflow[]> {
  const jobs = await getSchedulerQueue().getRepeatableJobs();

  const result: ScheduledWorkflow[] = [];
  for (const job of jobs) {
    const workflowId = workflowIdOfJob(job);
    if (!workflowId) continue;
    const cron = job.pattern ?? '';
    result.push({
      workflowId,
      cron,
      nextRun: job.next ? new Date(job.next) : getNextCronRun(cron),
    });
  }
  return result;
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
      if (job.name !== 'cron-trigger') {
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
