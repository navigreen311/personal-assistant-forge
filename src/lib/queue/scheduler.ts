// ============================================================================
// Cron-based Workflow Trigger Scheduler
// Uses BullMQ repeat/cron capability for recurring workflow triggers
// ============================================================================

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

const activeSchedules = new Map<string, { cron: string; jobKey: string }>();

export async function registerCronTrigger(
  workflowId: string,
  cronExpression: string
): Promise<void> {
  const jobKey = `cron-${workflowId}`;

  // Remove existing schedule if present
  await unregisterCronTrigger(workflowId);

  await getSchedulerQueue().add(
    'cron-trigger',
    { workflowId },
    {
      repeat: {
        pattern: cronExpression,
      },
      jobId: jobKey,
    }
  );

  activeSchedules.set(workflowId, { cron: cronExpression, jobKey });
}

export async function unregisterCronTrigger(workflowId: string): Promise<void> {
  const schedule = activeSchedules.get(workflowId);
  if (schedule) {
    const repeatableJobs = await getSchedulerQueue().getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === schedule.jobKey || job.key.includes(workflowId)) {
        await getSchedulerQueue().removeRepeatableByKey(job.key);
      }
    }
    activeSchedules.delete(workflowId);
  }
}

export function getScheduledWorkflows(): ScheduledWorkflow[] {
  const result: ScheduledWorkflow[] = [];
  for (const [workflowId, schedule] of activeSchedules) {
    result.push({
      workflowId,
      cron: schedule.cron,
      nextRun: getNextCronRun(schedule.cron),
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
