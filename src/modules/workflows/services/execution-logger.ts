// ============================================================================
// Execution Logger — Audit Trail & Rollback
// Logs all workflow execution steps to ActionLog for tamper-proof audit
// ============================================================================

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { WorkflowExecution, StepExecutionResult } from '@/modules/workflows/types';

/**
 * Prove that a run belongs to this tenant.
 *
 * P-09 (T-001): `ActionLog` rows are matched here by `target contains
 * "execution:<id>"`, and neither `ActionLog` nor `WorkflowExecutionRecord`
 * carries an entityId. The scope therefore comes from the chain that does --
 * run record -> workflow -> entity -- and it is proved BEFORE any log row is
 * read or any rollback is attempted. Before this, `POST /api/workflows/x/
 * executions/<any id>/rollback` would reverse another tenant's workflow run
 * for anyone who could guess an execution id.
 */
async function ownsExecution(
  executionId: string,
  entityId: string
): Promise<boolean> {
  const record = await prisma.workflowExecutionRecord.findUnique({
    where: { id: executionId },
    select: { workflowId: true },
  });
  if (!record) return false;

  const workflow = await prisma.workflow.findFirst({
    where: { id: record.workflowId, entityId },
    select: { id: true },
  });
  return Boolean(workflow);
}

export async function logExecution(execution: WorkflowExecution): Promise<void> {
  await prisma.actionLog.create({
    data: {
      actor: execution.triggeredBy === 'SYSTEM' ? 'SYSTEM' : 'HUMAN',
      actorId: execution.triggeredBy !== 'SYSTEM' ? execution.triggeredBy : undefined,
      actionType: 'WORKFLOW_EXECUTION',
      target: `workflow:${execution.workflowId}/execution:${execution.id}`,
      reason: `Workflow execution ${execution.status} (trigger: ${execution.triggerType})`,
      blastRadius: 'MEDIUM',
      reversible: true,
      rollbackPath: JSON.stringify({
        executionId: execution.id,
        workflowId: execution.workflowId,
        steps: execution.stepResults.map((s) => s.nodeId),
      }),
      status: execution.status === 'COMPLETED' ? 'EXECUTED' : 'FAILED',
    },
  });
}

export async function logStepResult(
  executionId: string,
  result: StepExecutionResult
): Promise<void> {
  await prisma.actionLog.create({
    data: {
      actor: 'SYSTEM',
      actionType: `WORKFLOW_STEP_${result.status}`,
      target: `execution:${executionId}/node:${result.nodeId}`,
      reason: `Step ${result.status}${result.error ? `: ${result.error}` : ''}`,
      blastRadius: 'LOW',
      reversible: result.status === 'COMPLETED',
      rollbackPath: result.status === 'COMPLETED'
        ? JSON.stringify({
            executionId,
            nodeId: result.nodeId,
            output: result.output,
          })
        : undefined,
      status: result.status === 'COMPLETED' ? 'EXECUTED' : 'FAILED',
    },
  });
}

export async function getExecutionLog(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<{
  id: string;
  actor: string;
  actorId: string | null;
  actionType: string;
  target: string;
  reason: string;
  blastRadius: string;
  reversible: boolean;
  rollbackPath: string | null;
  status: string;
  cost: number | null;
  timestamp: Date;
}[]> {
  // Scope proved on the parent, and nothing is read until it is.
  if (!(await ownsExecution(executionId, entityId))) return [];

  const logs = await prisma.actionLog.findMany({
    where: {
      target: {
        contains: `execution:${executionId}`,
      },
    },
    orderBy: { timestamp: 'asc' },
  });

  return logs;
}

export async function rollbackExecution(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<{
  rolledBack: StepExecutionResult[];
  failed: StepExecutionResult[];
}> {
  // Reversing a run is a write. Refuse before touching anything.
  if (!(await ownsExecution(executionId, entityId))) {
    throw new Error(`Execution ${executionId} not found`);
  }

  const logs = await prisma.actionLog.findMany({
    where: {
      target: {
        contains: `execution:${executionId}`,
      },
      status: 'EXECUTED',
      reversible: true,
    },
    orderBy: { timestamp: 'desc' }, // Reverse order for rollback
  });

  const rolledBack: StepExecutionResult[] = [];
  const failed: StepExecutionResult[] = [];

  for (const log of logs) {
    try {
      if (!log.rollbackPath) continue;

      const rollbackInfo = JSON.parse(log.rollbackPath) as {
        executionId: string;
        nodeId?: string;
        output?: Record<string, unknown>;
      };

      // Mark the original log as rolled back
      await prisma.actionLog.update({
        where: { id: log.id },
        data: { status: 'ROLLED_BACK' },
      });

      // Create rollback log entry
      await prisma.actionLog.create({
        data: {
          actor: 'SYSTEM',
          actionType: 'WORKFLOW_ROLLBACK',
          target: log.target,
          reason: `Rolled back: ${log.reason}`,
          blastRadius: log.blastRadius,
          reversible: false,
          status: 'EXECUTED',
        },
      });

      rolledBack.push({
        nodeId: rollbackInfo.nodeId ?? log.target,
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        input: {},
        output: { rolledBack: true },
        retryCount: 0,
      });
    } catch (err) {
      failed.push({
        nodeId: log.target,
        status: 'FAILED',
        startedAt: new Date(),
        completedAt: new Date(),
        input: {},
        output: {},
        error: err instanceof Error ? err.message : String(err),
        retryCount: 0,
      });
    }
  }

  return { rolledBack, failed };
}
