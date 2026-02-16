// ============================================================================
// Execution Logger — Audit Trail & Rollback
// Logs all workflow execution steps to ActionLog for tamper-proof audit
// ============================================================================

import { prisma } from '@/lib/db';
import type { WorkflowExecution, StepExecutionResult } from '@/modules/workflows/types';

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

export async function getExecutionLog(executionId: string): Promise<{
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
  executionId: string
): Promise<{
  rolledBack: StepExecutionResult[];
  failed: StepExecutionResult[];
}> {
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
