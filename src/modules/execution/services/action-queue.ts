// ============================================================================
// Action Queue / Flight Control Service
// Manages the lifecycle of actions: enqueue, approve, reject, execute
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { AutonomyLevel } from '@/shared/types';
import prisma from '@/lib/db';
import type { QueuedAction, ActionQueueFilters } from '../types';
import { evaluateGates } from './execution-gate';

// --- In-Memory Action Store ---
// In production this would be backed by a dedicated table or Redis.
// For now, ActionLog in Prisma is the source of truth; this map caches queue state.

const actionStore = new Map<string, QueuedAction>();

// --- Public API ---

export async function enqueueAction(
  params: Omit<QueuedAction, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  autonomyLevel: AutonomyLevel = 'EXECUTE_WITH_APPROVAL'
): Promise<QueuedAction> {
  const id = uuidv4();
  const now = new Date();

  // Create ActionLog record in Prisma
  const actionLog = await prisma.actionLog.create({
    data: {
      actor: params.actor,
      actorId: params.actorId,
      actionType: params.actionType,
      target: params.target,
      reason: params.reason,
      blastRadius: params.blastRadius,
      reversible: params.reversible,
      rollbackPath: params.rollbackPlan,
      status: 'PENDING',
      cost: params.estimatedCost,
    },
  });

  // Determine if approval is required
  const requiresApproval = determineApprovalRequirement(
    params.blastRadius,
    autonomyLevel,
    params.requiresApproval
  );

  let status: QueuedAction['status'] = 'QUEUED';

  // Auto-approval logic
  if (autonomyLevel === 'SUGGEST') {
    // Only suggest — don't queue for execution
    status = 'QUEUED';
  } else if (
    autonomyLevel === 'EXECUTE_AUTONOMOUS' &&
    params.blastRadius === 'LOW' &&
    !requiresApproval
  ) {
    status = 'APPROVED';
  }

  const queuedAction: QueuedAction = {
    id,
    actionLogId: actionLog.id,
    actor: params.actor,
    actorId: params.actorId,
    actionType: params.actionType,
    target: params.target,
    description: params.description,
    reason: params.reason,
    impact: params.impact,
    rollbackPlan: params.rollbackPlan,
    blastRadius: params.blastRadius,
    reversible: params.reversible,
    estimatedCost: params.estimatedCost,
    status,
    requiresApproval,
    scheduledFor: params.scheduledFor,
    entityId: params.entityId,
    projectId: params.projectId,
    workflowExecutionId: params.workflowExecutionId,
    createdAt: now,
    updatedAt: now,
  };

  actionStore.set(id, queuedAction);
  return queuedAction;
}

export async function approveAction(
  actionId: string,
  approverId: string
): Promise<QueuedAction> {
  const action = actionStore.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }
  if (action.status !== 'QUEUED') {
    throw new Error(`Cannot approve action with status ${action.status}. Only QUEUED actions can be approved.`);
  }

  action.status = 'APPROVED';
  action.approvedBy = approverId;
  action.approvedAt = new Date();
  action.updatedAt = new Date();

  actionStore.set(actionId, action);
  return action;
}

export async function rejectAction(
  actionId: string,
  _reason: string
): Promise<QueuedAction> {
  const action = actionStore.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }
  if (action.status !== 'QUEUED') {
    throw new Error(`Cannot reject action with status ${action.status}. Only QUEUED actions can be rejected.`);
  }

  action.status = 'REJECTED';
  action.updatedAt = new Date();

  // Update ActionLog
  await prisma.actionLog.update({
    where: { id: action.actionLogId },
    data: { status: 'FAILED' },
  });

  actionStore.set(actionId, action);
  return action;
}

export async function executeAction(actionId: string): Promise<QueuedAction> {
  const action = actionStore.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }
  if (action.status !== 'APPROVED') {
    throw new Error(
      `Cannot execute action with status ${action.status}. Only APPROVED actions can be executed.`
    );
  }

  // Evaluate execution gates
  const gateResult = await evaluateGates(action, {
    blastRadius: action.blastRadius,
  });
  if (!gateResult.passed) {
    action.status = 'FAILED';
    action.updatedAt = new Date();
    actionStore.set(actionId, action);
    throw new Error(
      `Execution blocked by gate "${gateResult.blockedBy?.name}": ${gateResult.reason}`
    );
  }

  // Mark as executing
  action.status = 'EXECUTING';
  action.updatedAt = new Date();
  actionStore.set(actionId, action);

  try {
    // Create ConsentReceipt
    await prisma.consentReceipt.create({
      data: {
        actionId: action.actionLogId,
        description: action.description,
        reason: action.reason,
        impacted: [action.target],
        reversible: action.reversible,
        rollbackLink: `/api/execution/rollback/${actionId}`,
        confidence: 0.8,
      },
    });

    // Update ActionLog to EXECUTED
    await prisma.actionLog.update({
      where: { id: action.actionLogId },
      data: { status: 'EXECUTED' },
    });

    action.status = 'EXECUTED';
    action.executedAt = new Date();
    action.updatedAt = new Date();
    actionStore.set(actionId, action);
    return action;
  } catch (err) {
    action.status = 'FAILED';
    action.updatedAt = new Date();
    actionStore.set(actionId, action);

    await prisma.actionLog.update({
      where: { id: action.actionLogId },
      data: { status: 'FAILED' },
    });

    throw err;
  }
}

export async function getQueuedActions(
  filters: ActionQueueFilters,
  page = 1,
  pageSize = 20
): Promise<{ data: QueuedAction[]; total: number }> {
  let actions = Array.from(actionStore.values());

  // Apply filters
  if (filters.status) {
    actions = actions.filter((a) => a.status === filters.status);
  }
  if (filters.actor) {
    actions = actions.filter((a) => a.actor === filters.actor);
  }
  if (filters.blastRadius) {
    actions = actions.filter((a) => a.blastRadius === filters.blastRadius);
  }
  if (filters.entityId) {
    actions = actions.filter((a) => a.entityId === filters.entityId);
  }
  if (filters.projectId) {
    actions = actions.filter((a) => a.projectId === filters.projectId);
  }
  if (filters.dateRange) {
    actions = actions.filter(
      (a) =>
        a.createdAt >= filters.dateRange!.from &&
        a.createdAt <= filters.dateRange!.to
    );
  }

  // Sort by creation time descending
  actions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = actions.length;
  const start = (page - 1) * pageSize;
  const data = actions.slice(start, start + pageSize);

  return { data, total };
}

export async function getActionById(
  actionId: string
): Promise<QueuedAction | null> {
  return actionStore.get(actionId) ?? null;
}

export async function scheduleAction(
  actionId: string,
  scheduledFor: Date
): Promise<QueuedAction> {
  const action = actionStore.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  action.scheduledFor = scheduledFor;
  action.updatedAt = new Date();
  actionStore.set(actionId, action);
  return action;
}

export async function bulkApprove(
  actionIds: string[],
  approverId: string
): Promise<{ approved: number; failed: number }> {
  let approved = 0;
  let failed = 0;

  for (const id of actionIds) {
    try {
      await approveAction(id, approverId);
      approved++;
    } catch {
      failed++;
    }
  }

  return { approved, failed };
}

export async function bulkReject(
  actionIds: string[],
  reason: string
): Promise<{ rejected: number; failed: number }> {
  let rejected = 0;
  let failed = 0;

  for (const id of actionIds) {
    try {
      await rejectAction(id, reason);
      rejected++;
    } catch {
      failed++;
    }
  }

  return { rejected, failed };
}

export async function cancelAction(actionId: string): Promise<QueuedAction> {
  const action = actionStore.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }
  if (action.status !== 'QUEUED') {
    throw new Error(`Cannot cancel action with status ${action.status}. Only QUEUED actions can be cancelled.`);
  }

  action.status = 'REJECTED';
  action.updatedAt = new Date();
  actionStore.set(actionId, action);

  await prisma.actionLog.update({
    where: { id: action.actionLogId },
    data: { status: 'FAILED' },
  });

  return action;
}

// --- Internal Helpers ---

function determineApprovalRequirement(
  blastRadius: string,
  autonomyLevel: AutonomyLevel,
  explicitRequirement?: boolean
): boolean {
  if (explicitRequirement !== undefined) return explicitRequirement;

  // SUGGEST mode always requires approval
  if (autonomyLevel === 'SUGGEST') return true;

  // DRAFT mode always requires approval
  if (autonomyLevel === 'DRAFT') return true;

  // EXECUTE_WITH_APPROVAL always requires approval
  if (autonomyLevel === 'EXECUTE_WITH_APPROVAL') return true;

  // EXECUTE_AUTONOMOUS: only auto-approve LOW blast radius
  if (autonomyLevel === 'EXECUTE_AUTONOMOUS') {
    return blastRadius !== 'LOW';
  }

  return true;
}

// --- Testing Helpers ---

export function _clearActionStore(): void {
  actionStore.clear();
}

export function _getActionStore(): Map<string, QueuedAction> {
  return actionStore;
}
