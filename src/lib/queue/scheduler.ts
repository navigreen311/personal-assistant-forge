// ============================================================================
// Cron-based Workflow Trigger Scheduler
// Uses BullMQ repeat/cron capability for recurring workflow triggers
// ============================================================================

import { Queue } from 'bullmq';
import { getRedisUrl } from './connection';

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

export { getSchedulerQueue };
