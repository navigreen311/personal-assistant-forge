import { prisma } from '@/lib/db';
import { enqueueStepExecution } from '@/lib/queue/workflow-queue';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processWorkflowStepJob(
  data: JobDataMap[typeof JobType.WORKFLOW_STEP]
): Promise<JobResult> {
  const start = Date.now();

  try {
    const execution = await prisma.workflow.findUnique({
      where: { id: data.executionId },
    });

    if (!execution) {
      return {
        success: false,
        message: `Execution ${data.executionId} not found`,
        processingTimeMs: Date.now() - start,
      };
    }

    const jobId = await enqueueStepExecution(
      data.executionId,
      data.nodeId,
      data.input
    );

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'WORKFLOW_STEP',
        target: `workflow:${execution.id}/execution:${data.executionId}/node:${data.nodeId}`,
        reason: `Executed workflow step ${data.nodeId}`,
        blastRadius: 'LOW',
        reversible: true,
        status: 'EXECUTED',
      },
    });

    return {
      success: true,
      message: `Workflow step ${data.nodeId} enqueued`,
      data: { jobId, executionId: data.executionId, nodeId: data.nodeId },
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[WorkflowProcessor] Failed to process step:', message);
    throw err;
  }
}
