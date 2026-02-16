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

export async function enqueueWorkflowExecution(
  executionId: string,
  workflowId: string,
  variables: Record<string, unknown>,
  delay?: number
): Promise<string> {
  const job = await getQueue().add(
    'execute-workflow',
    { executionId, workflowId, variables },
    {
      jobId: `wf-exec-${executionId}`,
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
