// ============================================================================
// Human-in-the-Loop Approval Service
// Manages approval requests, responses, escalation, and multi-approver flows
// ============================================================================
//
// P-09 (T-007): approvals lived in a module-level `Map`, with ids minted from
// a module-level counter (`approval-${Date.now()}-${n}`). Both are gone.
//
// The counter mattered twice over: it resets to zero on restart, so ids repeat
// across restarts, and two approvals requested inside the same millisecond
// before a restart and after it collide outright. Ids now come from the
// `cuid()` default on `WorkflowApproval`.
//
// The Map mattered more. An approval queue is the record of a human being
// asked for permission. Losing it on `restart: unless-stopped` loses both the
// pending question and the answers already given -- and the workflow that is
// waiting on it waits forever.
//
// P-09 (T-001): `WorkflowApproval` has no entityId column. The scope is proved
// through the chain that does have one -- approval -> execution record ->
// workflow -> entity -- and `approverId` is the AUTHENTICATED caller. Before
// this change `POST /api/workflows/approvals` took `approverId` off the
// request body, so any signed-in user could cast an approval in anyone's name.
//
// P-09: escalation no longer uses `setTimeout`. A timer scheduled for six
// hours' time does not survive a restart, so an approval that should have
// escalated silently never did. Escalation is now computed from `createdAt`
// when the approval is read, which is correct across any number of restarts.

import type {
  HumanApprovalNodeConfig,
  ApprovalRequest,
  ApprovalResponse,
} from '@/modules/workflows/types';
import { prisma } from '@/lib/db';

// --- Row <-> interface reconciliation ---

interface ApprovalRow {
  id: string;
  executionId: string;
  workflowName: string;
  stepLabel: string;
  config: unknown;
  stepData: unknown;
  responses: unknown;
  status: string;
  createdAt: Date;
  expiresAt: Date;
}

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface Approval {
  id: string;
  executionId: string;
  workflowName: string;
  stepLabel: string;
  config: HumanApprovalNodeConfig;
  stepData: Record<string, unknown>;
  responses: ApprovalResponse[];
  status: ApprovalStatus;
  createdAt: Date;
  expiresAt: Date;
}

function toApproval(row: ApprovalRow): Approval {
  const responses = ((row.responses as ApprovalResponse[]) ?? []).map((r) => ({
    ...r,
    respondedAt: new Date(r.respondedAt),
  }));

  return {
    id: row.id,
    executionId: row.executionId,
    workflowName: row.workflowName,
    stepLabel: row.stepLabel,
    config: row.config as HumanApprovalNodeConfig,
    stepData: (row.stepData as Record<string, unknown>) ?? {},
    responses,
    status: row.status as ApprovalStatus,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

// --- Public API ---

export async function requestApproval(
  config: HumanApprovalNodeConfig,
  executionId: string,
  stepData: Record<string, unknown>,
  workflowName = 'Workflow',
  stepLabel = 'Approval Step'
): Promise<{ approvalId: string; status: 'PENDING' }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.timeoutHours * 60 * 60 * 1000);

  const row = await prisma.workflowApproval.create({
    data: {
      executionId,
      workflowName,
      stepLabel,
      config: config as unknown as object,
      stepData: stepData as unknown as object,
      responses: [],
      status: 'PENDING',
      expiresAt,
    },
  });

  // Log the approval request
  await prisma.actionLog.create({
    data: {
      actor: 'SYSTEM',
      actionType: 'APPROVAL_REQUESTED',
      target: `execution:${executionId}/approval:${row.id}`,
      reason: config.message,
      blastRadius: 'MEDIUM',
      reversible: true,
      status: 'PENDING',
    },
  });

  return { approvalId: row.id, status: 'PENDING' };
}

export async function submitApproval(
  approvalId: string,
  approverId: string,
  approved: boolean,
  comment?: string
): Promise<{ status: 'APPROVED' | 'REJECTED' | 'PENDING' }> {
  const row = await prisma.workflowApproval.findUnique({
    where: { id: approvalId },
  });
  if (!row) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  const approval = await applyDueEscalation(toApproval(row as ApprovalRow));

  if (approval.status !== 'PENDING') {
    throw new Error(
      `Approval ${approvalId} is no longer pending (status: ${approval.status})`
    );
  }

  // Check for expired approval
  if (new Date() > approval.expiresAt) {
    await setStatus(approvalId, 'EXPIRED');
    throw new Error(`Approval ${approvalId} has expired`);
  }

  // Prevent duplicate response from same approver
  const existingResponse = approval.responses.find(
    (r) => r.approverId === approverId
  );
  if (existingResponse) {
    throw new Error(
      `Approver ${approverId} has already responded to this approval`
    );
  }

  // Verify approver is authorized. `approverId` is the session's user id, so
  // this is now a real authorization check rather than a check against a name
  // the requester chose.
  if (!approval.config.approverIds.includes(approverId)) {
    throw new Error(`User ${approverId} is not an authorized approver`);
  }

  const responses: ApprovalResponse[] = [
    ...approval.responses,
    { approverId, approved, comment, respondedAt: new Date() },
  ];

  // Check if we have a rejection
  if (!approved) {
    await prisma.workflowApproval.update({
      where: { id: approvalId },
      data: { responses: responses as unknown as object, status: 'REJECTED' },
    });

    await prisma.actionLog.create({
      data: {
        actor: 'HUMAN',
        actorId: approverId,
        actionType: 'APPROVAL_REJECTED',
        target: `approval:${approvalId}`,
        reason: comment ?? 'Rejected without comment',
        blastRadius: 'MEDIUM',
        reversible: false,
        status: 'EXECUTED',
      },
    });

    return { status: 'REJECTED' };
  }

  // Check if required approvals met
  const approvalCount = responses.filter((r) => r.approved).length;
  const met = approvalCount >= approval.config.requiredApprovals;

  await prisma.workflowApproval.update({
    where: { id: approvalId },
    data: {
      responses: responses as unknown as object,
      status: met ? 'APPROVED' : 'PENDING',
    },
  });

  if (met) {
    await prisma.actionLog.create({
      data: {
        actor: 'HUMAN',
        actorId: approverId,
        actionType: 'APPROVAL_GRANTED',
        target: `approval:${approvalId}`,
        reason: `Approved (${approvalCount}/${approval.config.requiredApprovals} required)`,
        blastRadius: 'MEDIUM',
        reversible: false,
        status: 'EXECUTED',
      },
    });

    return { status: 'APPROVED' };
  }

  return { status: 'PENDING' };
}

export async function getApprovalStatus(
  approvalId: string,
  viewerId?: string
): Promise<{
  approvalId: string;
  status: string;
  approvals: number;
  required: number;
  responses: ApprovalResponse[];
}> {
  const row = await prisma.workflowApproval.findUnique({
    where: { id: approvalId },
  });
  if (!row) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  const approval = await applyDueEscalation(toApproval(row as ApprovalRow));

  // A named approver may read an approval; nobody else may. Passing no viewer
  // is the internal path (the executor asking about a step it created).
  if (viewerId !== undefined && !approval.config.approverIds.includes(viewerId)) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  // Check expiration
  let status: ApprovalStatus = approval.status;
  if (status === 'PENDING' && new Date() > approval.expiresAt) {
    status = 'EXPIRED';
    await setStatus(approvalId, 'EXPIRED');
  }

  return {
    approvalId,
    status,
    approvals: approval.responses.filter((r) => r.approved).length,
    required: approval.config.requiredApprovals,
    responses: approval.responses,
  };
}

/**
 * The approvals this user is being asked for.
 *
 * `userId` is the session's user id. Before P-09 the route read it off
 * `?userId=`, so anyone could enumerate anyone else's pending approvals --
 * including the message and step data of workflows in another tenant.
 */
export async function getPendingApprovals(
  userId: string
): Promise<ApprovalRequest[]> {
  const rows = await prisma.workflowApproval.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const pending: ApprovalRequest[] = [];

  for (const raw of rows as ApprovalRow[]) {
    const approval = await applyDueEscalation(toApproval(raw));

    // Skip expired
    if (now > approval.expiresAt) {
      if (approval.status === 'PENDING') {
        await setStatus(approval.id, 'EXPIRED');
      }
      continue;
    }

    // Only include pending approvals where user is an approver and hasn't
    // responded. The approver list IS the scope here.
    if (
      approval.status === 'PENDING' &&
      approval.config.approverIds.includes(userId) &&
      !approval.responses.some((r) => r.approverId === userId)
    ) {
      pending.push({
        id: approval.id,
        executionId: approval.executionId,
        workflowName: approval.workflowName,
        stepLabel: approval.stepLabel,
        message: approval.config.message,
        requiredApprovals: approval.config.requiredApprovals,
        currentApprovals: approval.responses.filter((r) => r.approved).length,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
      });
    }
  }

  return pending;
}

// --- Escalation ---

/**
 * Add the escalation approvers if the escalation window has passed.
 *
 * Computed from `createdAt`, not scheduled with `setTimeout`: a timer is lost
 * on restart, and an escalation that silently never fires is exactly the class
 * of "the system reports it is protected" failure this package exists to close.
 * Idempotent -- an approver already on the list is not added or logged twice.
 */
async function applyDueEscalation(approval: Approval): Promise<Approval> {
  const { escalateAfter, escalateTo } = approval.config;
  if (!escalateAfter || !escalateTo || escalateTo.length === 0) return approval;
  if (approval.status !== 'PENDING') return approval;

  const dueAt = new Date(
    approval.createdAt.getTime() + escalateAfter * 60 * 60 * 1000
  );
  if (new Date() < dueAt) return approval;

  const missing = escalateTo.filter(
    (userId) => !approval.config.approverIds.includes(userId)
  );
  if (missing.length === 0) return approval;

  for (const userId of missing) {
    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'APPROVAL_ESCALATED',
        target: `approval:${approval.id}/escalation:${userId}`,
        reason: `Approval escalated after ${escalateAfter}h without resolution`,
        blastRadius: 'MEDIUM',
        reversible: false,
        status: 'EXECUTED',
      },
    });
  }

  const config: HumanApprovalNodeConfig = {
    ...approval.config,
    approverIds: [...approval.config.approverIds, ...missing],
  };

  await prisma.workflowApproval.update({
    where: { id: approval.id },
    data: { config: config as unknown as object },
  });

  return { ...approval, config };
}

// --- Internal ---

async function setStatus(
  approvalId: string,
  status: ApprovalStatus
): Promise<void> {
  await prisma.workflowApproval.update({
    where: { id: approvalId },
    data: { status },
  });
}

// --- Testing Helpers ---

/** Remove every approval. A real delete now -- there is no Map to clear. */
export async function clearApprovalStore(): Promise<void> {
  await prisma.workflowApproval.deleteMany({});
}

export async function getApprovalStoreSize(): Promise<number> {
  return prisma.workflowApproval.count();
}
