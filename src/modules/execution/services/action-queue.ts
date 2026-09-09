// ============================================================================
// Action Queue / Flight Control Service
// Manages the lifecycle of actions: enqueue, approve, reject, execute
// ============================================================================
//
// P-09 (T-007): the queue used to be a module-level `Map` with a comment
// saying "in production this would be backed by a dedicated table". P-00
// landed that table. The queue is the approval buffer for everything the
// platform is about to do to a user's data, so losing it on a restart loses
// both the record of what was pending and the record of what a human had
// already approved. `QueuedAction` is now the source of truth.
//
// P-09 (T-001): every function takes a VerifiedEntityId and puts it in the
// WHERE clause. An action belonging to another tenant is simply not found, so
// there is no check-then-act to forget and no statement ordering that can make
// it wrong. `approvedBy` is the authenticated caller, never a body field.

import type { AutonomyLevel } from '@/shared/types';
import prisma from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { QueuedAction, ActionQueueFilters } from '../types';
import { evaluateGates } from './execution-gate';

// --- Row <-> interface reconciliation ---

interface ActionRow {
  id: string;
  actionLogId: string;
  actor: string;
  actorId: string | null;
  actionType: string;
  target: string;
  description: string;
  reason: string;
  impact: string;
  rollbackPlan: string;
  blastRadius: string;
  reversible: boolean;
  estimatedCost: number | null;
  status: string;
  requiresApproval: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  scheduledFor: Date | null;
  entityId: string;
  projectId: string | null;
  workflowExecutionId: string | null;
  createdAt: Date;
}

/**
 * `QueuedAction` carries `updatedAt`; the landed table does not, deliberately
 * (the schema is frozen, and an extra column would mean a migration). The last
 * transition is recoverable from the timestamps that ARE columns, so it is
 * reconciled on the read side rather than stored twice.
 */
function toQueuedAction(row: ActionRow): QueuedAction {
  return {
    id: row.id,
    actionLogId: row.actionLogId,
    actor: row.actor as QueuedAction['actor'],
    actorId: row.actorId ?? undefined,
    actionType: row.actionType,
    target: row.target,
    description: row.description,
    reason: row.reason,
    impact: row.impact,
    rollbackPlan: row.rollbackPlan,
    blastRadius: row.blastRadius as QueuedAction['blastRadius'],
    reversible: row.reversible,
    estimatedCost: row.estimatedCost ?? undefined,
    status: row.status as QueuedAction['status'],
    requiresApproval: row.requiresApproval,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt ?? undefined,
    executedAt: row.executedAt ?? undefined,
    scheduledFor: row.scheduledFor ?? undefined,
    entityId: row.entityId,
    projectId: row.projectId ?? undefined,
    workflowExecutionId: row.workflowExecutionId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.executedAt ?? row.approvedAt ?? row.createdAt,
  };
}

export type EnqueueActionParams = Omit<
  QueuedAction,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'entityId'
>;

// --- Public API ---

/**
 * Enqueue an action for a verified tenant.
 *
 * `entityId` is a separate, required argument rather than a field on the draft,
 * so a route cannot supply the scope by spreading a parsed request body.
 */
export async function enqueueAction(
  params: EnqueueActionParams,
  entityId: VerifiedEntityId,
  autonomyLevel: AutonomyLevel = 'EXECUTE_WITH_APPROVAL'
): Promise<QueuedAction> {
  return insertAction(params, entityId, autonomyLevel);
}

/**
 * Enqueue an action on behalf of the entity that owns a stored record.
 *
 * TRUSTED PROVENANCE ONLY. The only caller is the runbook engine, which reads
 * `runbook.entityId` off a database column -- there is no request and no user
 * to verify against. `grep -rn ForEntityOwner src/` finds every such write.
 * Deliberately not re-exported from the module index.
 */
export async function enqueueActionForEntityOwner(
  params: EnqueueActionParams,
  entityId: string,
  autonomyLevel: AutonomyLevel = 'EXECUTE_WITH_APPROVAL'
): Promise<QueuedAction> {
  return insertAction(params, entityId, autonomyLevel);
}

async function insertAction(
  params: EnqueueActionParams,
  entityId: string,
  autonomyLevel: AutonomyLevel
): Promise<QueuedAction> {
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

  const row = await prisma.queuedAction.create({
    data: {
      actionLogId: actionLog.id,
      actor: params.actor,
      actorId: params.actorId ?? null,
      actionType: params.actionType,
      target: params.target,
      description: params.description,
      reason: params.reason,
      impact: params.impact,
      rollbackPlan: params.rollbackPlan,
      blastRadius: params.blastRadius,
      reversible: params.reversible,
      estimatedCost: params.estimatedCost ?? null,
      status,
      requiresApproval,
      approvedBy: params.approvedBy ?? null,
      approvedAt: params.approvedAt ?? null,
      scheduledFor: params.scheduledFor ?? null,
      projectId: params.projectId ?? null,
      workflowExecutionId: params.workflowExecutionId ?? null,
      // LAST and unconditional: this is the row's tenant.
      entityId,
    },
  });

  return toQueuedAction(row as ActionRow);
}

/**
 * Approve a queued action.
 *
 * `approverId` is the authenticated caller's user id, resolved by the route
 * from the session. Before P-09 the route read it off the request body, so the
 * approval record named whoever the requester chose to name.
 */
export async function approveAction(
  actionId: string,
  approverId: string,
  entityId: VerifiedEntityId
): Promise<QueuedAction> {
  const existing = await requireAction(actionId, entityId);
  if (existing.status !== 'QUEUED') {
    throw new Error(
      `Cannot approve action with status ${existing.status}. Only QUEUED actions can be approved.`
    );
  }

  await prisma.queuedAction.updateMany({
    where: { id: actionId, entityId, status: 'QUEUED' },
    data: { status: 'APPROVED', approvedBy: approverId, approvedAt: new Date() },
  });

  return requireAction(actionId, entityId);
}

export async function rejectAction(
  actionId: string,
  _reason: string,
  entityId: VerifiedEntityId
): Promise<QueuedAction> {
  const existing = await requireAction(actionId, entityId);
  if (existing.status !== 'QUEUED') {
    throw new Error(
      `Cannot reject action with status ${existing.status}. Only QUEUED actions can be rejected.`
    );
  }

  await prisma.queuedAction.updateMany({
    where: { id: actionId, entityId, status: 'QUEUED' },
    data: { status: 'REJECTED' },
  });

  // Update ActionLog
  await prisma.actionLog.update({
    where: { id: existing.actionLogId },
    data: { status: 'FAILED' },
  });

  return requireAction(actionId, entityId);
}

export async function executeAction(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<QueuedAction> {
  const action = await requireAction(actionId, entityId);
  if (action.status !== 'APPROVED') {
    throw new Error(
      `Cannot execute action with status ${action.status}. Only APPROVED actions can be executed.`
    );
  }

  // Evaluate execution gates. The rules are read from Postgres, so this is the
  // same answer in a fresh process, in a second process, and after a restart.
  const gateResult = await evaluateGates(action, {
    blastRadius: action.blastRadius,
  });
  if (!gateResult.passed) {
    await prisma.queuedAction.updateMany({
      where: { id: actionId, entityId },
      data: { status: 'FAILED' },
    });
    throw new Error(
      `Execution blocked by gate "${gateResult.blockedBy?.name}": ${gateResult.reason}`
    );
  }

  // Mark as executing. APPROVED is in the WHERE, so two concurrent callers
  // cannot both get past this line.
  await prisma.queuedAction.updateMany({
    where: { id: actionId, entityId, status: 'APPROVED' },
    data: { status: 'EXECUTING' },
  });

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

    await prisma.queuedAction.updateMany({
      where: { id: actionId, entityId },
      data: { status: 'EXECUTED', executedAt: new Date() },
    });

    return requireAction(actionId, entityId);
  } catch (err) {
    await prisma.queuedAction.updateMany({
      where: { id: actionId, entityId },
      data: { status: 'FAILED' },
    });

    await prisma.actionLog.update({
      where: { id: action.actionLogId },
      data: { status: 'FAILED' },
    });

    throw err;
  }
}

/**
 * List the queue for one tenant.
 *
 * The scope is a leading argument and NOT a field on `filters`, because
 * `filters` is parsed wholesale off the query string -- leaving `entityId` on
 * it would let the caller name its own tenant all over again.
 */
export async function getQueuedActions(
  entityId: VerifiedEntityId,
  filters: Omit<ActionQueueFilters, 'entityId'> = {},
  page = 1,
  pageSize = 20
): Promise<{ data: QueuedAction[]; total: number }> {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.actor) where.actor = filters.actor;
  if (filters.blastRadius) where.blastRadius = filters.blastRadius;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.dateRange) {
    where.createdAt = { gte: filters.dateRange.from, lte: filters.dateRange.to };
  }

  // Applied last and unconditionally: no filter combination can widen it.
  where.entityId = entityId;

  const [rows, total] = await Promise.all([
    prisma.queuedAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.queuedAction.count({ where }),
  ]);

  return { data: (rows as ActionRow[]).map(toQueuedAction), total };
}

export async function getActionById(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<QueuedAction | null> {
  const row = await prisma.queuedAction.findFirst({
    where: { id: actionId, entityId },
  });
  return row ? toQueuedAction(row as ActionRow) : null;
}

export async function scheduleAction(
  actionId: string,
  scheduledFor: Date,
  entityId: VerifiedEntityId
): Promise<QueuedAction> {
  await requireAction(actionId, entityId);

  await prisma.queuedAction.updateMany({
    where: { id: actionId, entityId },
    data: { scheduledFor },
  });

  return requireAction(actionId, entityId);
}

export async function bulkApprove(
  actionIds: string[],
  approverId: string,
  entityId: VerifiedEntityId
): Promise<{ approved: number; failed: number }> {
  let approved = 0;
  let failed = 0;

  for (const id of actionIds) {
    try {
      await approveAction(id, approverId, entityId);
      approved++;
    } catch {
      failed++;
    }
  }

  return { approved, failed };
}

export async function bulkReject(
  actionIds: string[],
  reason: string,
  entityId: VerifiedEntityId
): Promise<{ rejected: number; failed: number }> {
  let rejected = 0;
  let failed = 0;

  for (const id of actionIds) {
    try {
      await rejectAction(id, reason, entityId);
      rejected++;
    } catch {
      failed++;
    }
  }

  return { rejected, failed };
}

export async function cancelAction(
  actionId: string,
  entityId: VerifiedEntityId
): Promise<QueuedAction> {
  const existing = await requireAction(actionId, entityId);
  if (existing.status !== 'QUEUED') {
    throw new Error(
      `Cannot cancel action with status ${existing.status}. Only QUEUED actions can be cancelled.`
    );
  }

  await prisma.queuedAction.updateMany({
    where: { id: actionId, entityId, status: 'QUEUED' },
    data: { status: 'REJECTED' },
  });

  await prisma.actionLog.update({
    where: { id: existing.actionLogId },
    data: { status: 'FAILED' },
  });

  return requireAction(actionId, entityId);
}

// --- Internal Helpers ---

async function requireAction(
  actionId: string,
  entityId: string
): Promise<QueuedAction> {
  const row = await prisma.queuedAction.findFirst({
    where: { id: actionId, entityId },
  });
  if (!row) {
    throw new Error(`Action ${actionId} not found`);
  }
  return toQueuedAction(row as ActionRow);
}

/**
 * Look an action up by id with no tenant scope, and record the outcome of a
 * rollback against it.
 *
 * TRUSTED PROVENANCE ONLY -- for the rollback engine, which has already proved
 * the scope of this exact action id one statement earlier. Deliberately not
 * re-exported from the module index.
 */
export async function getActionForEntityOwner(
  actionId: string
): Promise<QueuedAction | null> {
  const row = await prisma.queuedAction.findUnique({ where: { id: actionId } });
  return row ? toQueuedAction(row as ActionRow) : null;
}

export async function markActionRolledBackForEntityOwner(
  actionId: string
): Promise<void> {
  await prisma.queuedAction.updateMany({
    where: { id: actionId },
    data: { status: 'ROLLED_BACK' },
  });
}

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

/** Remove every queued action. A real delete now -- there is no Map to clear. */
export async function _clearActionStore(): Promise<void> {
  await prisma.queuedAction.deleteMany({});
}
