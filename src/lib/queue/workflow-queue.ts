// ============================================================================
// Workflow Execution Queue — BullMQ
// Enqueues workflow and step execution jobs
// ============================================================================

import { Queue } from 'bullmq';
import { getRedisUrl } from './connection';

const QUEUE_NAME = 'workflow-execution';

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: { url: getRedisUrl() },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

/**
 * Queue one leg of a run.
 *
 * `resumeFromNodeId` (P-31) is part of the job id because the id identifies the
 * WORK, not the run: "start execution E" and "continue execution E from node N"
 * are different jobs, and a run can legitimately be queued more than once —
 * once by the cron tick, again by each DELAY node that parks it, again by a
 * human releasing an approval.
 *
 * `removeOnComplete: { count: 1000 }` keeps completed jobs in Redis, and BullMQ
 * returns the EXISTING job for a duplicate `jobId` instead of queueing a second
 * one. With a bare `wf-exec-<executionId>` for every leg, the second leg of any
 * run was therefore dropped without an error and the run parked forever. Keying
 * on the resume point keeps the de-duplication that id was for — enqueueing the
 * same continuation twice is still a no-op — without collapsing distinct legs
 * onto one id.
 */
export async function enqueueWorkflowExecution(
  executionId: string,
  workflowId: string,
  variables: Record<string, unknown>,
  delay?: number,
  resumeFromNodeId?: string
): Promise<string> {
  const jobId = resumeFromNodeId
    ? `wf-exec-${executionId}-from-${resumeFromNodeId}`
    : `wf-exec-${executionId}`;
  const job = await getQueue().add(
    'execute-workflow',
    { executionId, workflowId, variables },
    {
      jobId,
      delay: delay ?? 0,
    }
  );
  return job.id ?? executionId;
}

export async function enqueueStepExecution(
  executionId: string,
  nodeId: string,
  input: Record<string, unknown>
): Promise<string> {
  const job = await getQueue().add(
    'execute-step',
    { executionId, nodeId, input },
    {
      jobId: `wf-step-${executionId}-${nodeId}`,
    }
  );
  return job.id ?? `${executionId}-${nodeId}`;
}

export async function getJobStatus(
  jobId: string
): Promise<{ status: string; progress: number }> {
  const job = await getQueue().getJob(jobId);
  if (!job) {
    return { status: 'NOT_FOUND', progress: 0 };
  }
  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;
  return { status: state, progress };
}

export async function cancelJob(jobId: string): Promise<void> {
  const job = await getQueue().getJob(jobId);
  if (job) {
    await job.remove();
  }
}

export { getQueue };
