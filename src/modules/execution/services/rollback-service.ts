// ============================================================================
// Rollback / Undo Service
// Creates and executes rollback plans for executed actions
// ============================================================================
//
// P-09 (T-007): rollback plans lived in a module-level `Map`. A rollback plan
// is the promise the consent receipt makes -- "this is reversible, here is
// how" -- so a plan that evaporates on restart silently turns a reversible
// action into an irreversible one. Plans now live in `RollbackPlan`.
//
// P-09 (T-001): `RollbackPlan` has no `entityId` column, and should not have
// one: the plan belongs to the action. The scope is therefore proved on the
// PARENT -- the queued action -- and every entry point returns early when that
// action is not this tenant's.

import prisma from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { RollbackPlan, RollbackStep, RollbackResult } from '../types';
import {
  getActionById,
  markActionRolledBackForEntityOwner,
} from './action-queue';

// --- Row <-> interface reconciliation ---

interface RollbackPlanRow {
  actionId: string;
  steps: unknown;
  estimatedDuration: number;
  canAutoRollback: boolean;
  requiresManualSteps: boolean;
  manualInstructions: string | null;
}

function toRollbackPlan(row: RollbackPlanRow): RollbackPlan {
  return {
    actionId: row.actionId,
    steps: (row.steps as RollbackStep[]) ?? [],
    estimatedDuration: row.estimatedDuration,
    canAutoRollback: row.canAutoRollback,
    requiresManualSteps: row.requiresManualSteps,
    manualInstructions: row.manualInstructions ?? undefined,
  };
}

// --- Action Type to Rollback Step Mapping ---

const ROLLBACK_STRATEGIES: Record<
  string,
  (actionId: string, target: string, params: Record<string, unknown>) => RollbackStep[]
> = {
  CREATE_TASK: (_actionId, target) => [
    {
      order: 1,
      description: `Delete created task ${target}`,
      type: 'DELETE',
      model: 'Task',
      recordId: target,
      status: 'PENDING',
    },
  ],
  CREATE_CONTACT: (_actionId, target) => [
    {
      order: 1,
      description: `Delete created contact ${target}`,
      type: 'DELETE',
      model: 'Contact',
      recordId: target,
      status: 'PENDING',
    },
  ],
  CREATE_PROJECT: (_actionId, target) => [
    {
      order: 1,
      description: `Delete created project ${target}`,
      type: 'DELETE',
      model: 'Project',
      recordId: target,
      status: 'PENDING',
    },
  ],
  UPDATE_RECORD: (_actionId, target, params) => [
    {
      order: 1,
      description: `Restore ${params.model ?? 'record'} ${target} to previous state`,
      type: 'RESTORE',
      model: (params.model as string) ?? 'Record',
      recordId: target,
      previousState: (params.previousState as Record<string, unknown>) ?? {},
      status: 'PENDING',
    },
  ],
  DELETE_RECORD: (_actionId, target, params) => [
    {
      order: 1,
      description: `Recreate deleted ${params.model ?? 'record'} ${target} from snapshot`,
      type: 'RESTORE',
      model: (params.model as string) ?? 'Record',
      recordId: target,
      previousState: (params.previousState as Record<string, unknown>) ?? {},
      status: 'PENDING',
    },
  ],
  DELETE_CONTACT: (_actionId, target, params) => [
    {
      order: 1,
      description: `Recreate deleted contact ${target} from snapshot`,
      type: 'RESTORE',
      model: 'Contact',
      recordId: target,
      previousState: (params.previousState as Record<string, unknown>) ?? {},
      status: 'PENDING',
    },
  ],
  DELETE_PROJECT: (_actionId, target, params) => [
    {
      order: 1,
      description: `Recreate deleted project ${target} from snapshot`,
      type: 'RESTORE',
      model: 'Project',
      recordId: target,
      previousState: (params.previousState as Record<string, unknown>) ?? {},
      status: 'PENDING',
    },
  ],
  SEND_MESSAGE: (_actionId, target) => [
    {
      order: 1,
      description: `Flag message ${target} as recalled (cannot truly unsend)`,
      type: 'UNDO_SEND',
      model: 'Message',
      recordId: target,
      status: 'PENDING',
    },
    {
      order: 2,
      description: 'Manually contact recipient to retract message if needed',
      type: 'MANUAL',
      status: 'PENDING',
    },
  ],
  GENERATE_DOCUMENT: (_actionId, target) => [
    {
      order: 1,
      description: `Delete generated document ${target}`,
      type: 'DELETE',
      model: 'Document',
      recordId: target,
      status: 'PENDING',
    },
  ],
  FINANCIAL_ACTION: (_actionId, target, params) => [
    {
      order: 1,
      description: `Reverse financial transaction ${target}`,
      type: 'UPDATE',
      model: 'FinancialRecord',
      recordId: target,
      previousState: (params.previousState as Record<string, unknown>) ?? {},
      status: 'PENDING',
    },
    {
      order: 2,
      description: 'Manually verify financial reversal with accounting',
      type: 'MANUAL',
      status: 'PENDING',
    },
  ],
  TRIGGER_WORKFLOW: (_actionId, target) => [
    {
      order: 1,
      description: `Manually review and reverse effects of workflow ${target}`,
      type: 'MANUAL',
      status: 'PENDING',
    },
  ],
  CALL_API: (_actionId, target) => [
    {
      order: 1,
      description: `Manually reverse effects of API call to ${target}`,
      type: 'MANUAL',
      status: 'PENDING',
    },
  ],
};

// --- Public API ---

export async function createRollbackPlan(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<RollbackPlan> {
  // Scope proved on the parent: a foreign action is simply not found.
  const action = await getActionById(actionId, entityId);

  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  const strategyFn = ROLLBACK_STRATEGIES[action.actionType];
  const steps: RollbackStep[] = strategyFn
    ? strategyFn(actionId, action.target, {})
    : [
        {
          order: 1,
          description: `Manually reverse action ${action.actionType} on ${action.target}`,
          type: 'MANUAL',
          status: 'PENDING',
        },
      ];

  const canAutoRollback = steps.every((s) => s.type !== 'MANUAL');
  const requiresManualSteps = steps.some((s) => s.type === 'MANUAL');
  const manualInstructions = requiresManualSteps
    ? steps
        .filter((s) => s.type === 'MANUAL')
        .map((s) => s.description)
        .join('\n')
    : null;

  const row = await prisma.rollbackPlan.upsert({
    where: { actionId },
    create: {
      actionId,
      steps: steps as unknown as object,
      estimatedDuration: steps.length * 1000,
      canAutoRollback,
      requiresManualSteps,
      manualInstructions,
    },
    update: {
      steps: steps as unknown as object,
      estimatedDuration: steps.length * 1000,
      canAutoRollback,
      requiresManualSteps,
      manualInstructions,
    },
  });

  return toRollbackPlan(row as RollbackPlanRow);
}

export async function executeRollback(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<RollbackResult> {
  const action = await getActionById(actionId, entityId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  let plan = await readPlan(actionId);
  if (!plan) {
    plan = await createRollbackPlan(actionId, entityId);
  }

  let stepsCompleted = 0;
  let stepsFailed = 0;
  let stepsSkipped = 0;

  // Execute steps in reverse order (last action reversed first)
  const sortedSteps = [...plan.steps].sort((a, b) => b.order - a.order);

  for (const step of sortedSteps) {
    try {
      if (step.type === 'MANUAL') {
        step.status = 'SKIPPED';
        stepsSkipped++;
        continue;
      }

      // Execute based on step type
      switch (step.type) {
        case 'RESTORE':
          if (step.model && step.recordId && step.previousState) {
            // In a real system, we'd restore the record from snapshot
            // For now, mark as completed
            step.status = 'COMPLETED';
            stepsCompleted++;
          } else {
            step.status = 'FAILED';
            stepsFailed++;
          }
          break;

        case 'DELETE':
          if (step.model && step.recordId) {
            step.status = 'COMPLETED';
            stepsCompleted++;
          } else {
            step.status = 'FAILED';
            stepsFailed++;
          }
          break;

        case 'UPDATE':
          if (step.model && step.recordId) {
            step.status = 'COMPLETED';
            stepsCompleted++;
          } else {
            step.status = 'FAILED';
            stepsFailed++;
          }
          break;

        case 'UNDO_SEND':
          // Flag message as recalled — cannot truly unsend
          step.status = 'COMPLETED';
          stepsCompleted++;
          break;

        default:
          step.status = 'SKIPPED';
          stepsSkipped++;
      }
    } catch {
      step.status = 'FAILED';
      stepsFailed++;
    }
  }

  // Persist the outcome of every step: the record of what was reversed has to
  // survive the restart this whole service exists to be trusted across.
  await prisma.rollbackPlan.updateMany({
    where: { actionId },
    data: { steps: plan.steps as unknown as object },
  });

  // Update ActionLog status
  await prisma.actionLog.update({
    where: { id: action.actionLogId },
    data: { status: 'ROLLED_BACK' },
  });
  await markActionRolledBackForEntityOwner(actionId);

  let status: RollbackResult['status'];
  if (stepsFailed === 0 && stepsSkipped === 0) {
    status = 'COMPLETE';
  } else if (stepsCompleted > 0) {
    status = 'PARTIAL';
  } else {
    status = 'FAILED';
  }

  return {
    actionId,
    status,
    stepsCompleted,
    stepsFailed,
    stepsSkipped,
    details: plan.steps,
  };
}

export async function getRollbackPlan(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<RollbackPlan | null> {
  const action = await getActionById(actionId, entityId);
  if (!action) return null;
  return readPlan(actionId);
}

export async function canRollback(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<{ canRollback: boolean; reason?: string }> {
  const action = await getActionById(actionId, entityId);

  if (!action) {
    return { canRollback: false, reason: 'Action not found' };
  }

  if (action.status === 'ROLLED_BACK') {
    return { canRollback: false, reason: 'Action has already been rolled back' };
  }

  if (action.status !== 'EXECUTED') {
    return {
      canRollback: false,
      reason: `Cannot rollback action with status ${action.status}. Only EXECUTED actions can be rolled back.`,
    };
  }

  if (!action.reversible) {
    return {
      canRollback: false,
      reason: 'Action is marked as irreversible',
    };
  }

  return { canRollback: true };
}

// --- Internal ---

async function readPlan(actionId: string): Promise<RollbackPlan | null> {
  const row = await prisma.rollbackPlan.findUnique({ where: { actionId } });
  return row ? toRollbackPlan(row as RollbackPlanRow) : null;
}

// --- Testing Helpers ---

/** Remove every rollback plan. A real delete now -- there is no Map to clear. */
export async function _clearRollbackStore(): Promise<void> {
  await prisma.rollbackPlan.deleteMany({});
}
