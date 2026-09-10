import { prisma } from '@/lib/db';
import { enqueueStepExecution } from '@/lib/queue/workflow-queue';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processWorkflowStepJob(
  data: JobDataMap[typeof JobType.WORKFLOW_STEP]
): Promise<JobResult> {
  const start = Date.now();

  try {
    // P-31. Was `prisma.workflow.findUnique({ where: { id: data.executionId } })`
    // — a WORKFLOW looked up by an EXECUTION id. The two are never the same
    // string, so this branch always returned "not found" and the WORKFLOW_STEP
    // job type has never enqueued anything in the life of the repository. The
    // failure was invisible because the miss is reported as `success: false`
    // with a plausible message rather than thrown.
    const execution = await prisma.workflowExecutionRecord.findUnique({
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

    // P-31. This row used to read "Executed workflow step <id>" with
    // `status: 'EXECUTED'`, two lines below a call that only ENQUEUES one —
    // the same defect as the worker this package was opened for, on the
    // producer side. What happened here is that a step was queued; the row now
    // says so, and stays PENDING until the consumer records an outcome.
    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'WORKFLOW_STEP',
        target: `workflow:${execution.workflowId}/execution:${data.executionId}/node:${data.nodeId}`,
        reason: `Queued workflow step ${data.nodeId} for execution`,
        blastRadius: 'LOW',
        reversible: true,
        status: 'PENDING',
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
