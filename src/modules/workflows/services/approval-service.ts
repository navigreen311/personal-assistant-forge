// ============================================================================
// Human-in-the-Loop Approval Service
// Manages approval requests, responses, escalation, and multi-approver flows
// ============================================================================

import type { HumanApprovalNodeConfig, ApprovalRequest, ApprovalResponse } from '@/modules/workflows/types';
import { prisma } from '@/lib/db';

// In-memory store for approvals (in production, use a database table)
const approvalStore = new Map<string, {
  config: HumanApprovalNodeConfig;
  executionId: string;
  stepData: Record<string, unknown>;
  workflowName: string;
  stepLabel: string;
  responses: ApprovalResponse[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
}>();

let approvalCounter = 0;

function generateApprovalId(): string {
  approvalCounter++;
  return `approval-${Date.now()}-${approvalCounter}`;
}

export async function requestApproval(
  config: HumanApprovalNodeConfig,
  executionId: string,
  stepData: Record<string, unknown>,
  workflowName = 'Workflow',
  stepLabel = 'Approval Step'
): Promise<{ approvalId: string; status: 'PENDING' }> {
  const approvalId = generateApprovalId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.timeoutHours * 60 * 60 * 1000);

  approvalStore.set(approvalId, {
    config,
    executionId,
    stepData,
    workflowName,
    stepLabel,
    responses: [],
    status: 'PENDING',
    createdAt: now,
    expiresAt,
  });

  // Log the approval request
  await prisma.actionLog.create({
    data: {
      actor: 'SYSTEM',
      actionType: 'APPROVAL_REQUESTED',
      target: `execution:${executionId}/approval:${approvalId}`,
      reason: config.message,
      blastRadius: 'MEDIUM',
      reversible: true,
      status: 'PENDING',
    },
  });

  // Schedule escalation check if configured
  if (config.escalateAfter) {
    scheduleEscalation(approvalId, config.escalateAfter, config.escalateTo ?? []);
  }

  return { approvalId, status: 'PENDING' };
}

export async function submitApproval(
  approvalId: string,
  approverId: string,
  approved: boolean,
  comment?: string
): Promise<{ status: 'APPROVED' | 'REJECTED' | 'PENDING' }> {
  const approval = approvalStore.get(approvalId);
  if (!approval) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  if (approval.status !== 'PENDING') {
    throw new Error(`Approval ${approvalId} is no longer pending (status: ${approval.status})`);
  }

  // Check for expired approval
  if (new Date() > approval.expiresAt) {
    approval.status = 'EXPIRED';
    throw new Error(`Approval ${approvalId} has expired`);
  }

  // Prevent duplicate response from same approver
  const existingResponse = approval.responses.find((r) => r.approverId === approverId);
  if (existingResponse) {
    throw new Error(`Approver ${approverId} has already responded to this approval`);
  }

  // Verify approver is authorized
  if (!approval.config.approverIds.includes(approverId)) {
    throw new Error(`User ${approverId} is not an authorized approver`);
  }

  approval.responses.push({
    approverId,
    approved,
    comment,
    respondedAt: new Date(),
  });

  // Check if we have a rejection
  if (!approved) {
    approval.status = 'REJECTED';

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
  const approvalCount = approval.responses.filter((r) => r.approved).length;
  if (approvalCount >= approval.config.requiredApprovals) {
    approval.status = 'APPROVED';

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
  approvalId: string
): Promise<{
  approvalId: string;
  status: string;
  approvals: number;
  required: number;
  responses: ApprovalResponse[];
}> {
  const approval = approvalStore.get(approvalId);
  if (!approval) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  // Check expiration
  if (approval.status === 'PENDING' && new Date() > approval.expiresAt) {
    approval.status = 'EXPIRED';
  }

  return {
    approvalId,
    status: approval.status,
    approvals: approval.responses.filter((r) => r.approved).length,
    required: approval.config.requiredApprovals,
    responses: approval.responses,
  };
}

export async function getPendingApprovals(userId: string): Promise<ApprovalRequest[]> {
  const pending: ApprovalRequest[] = [];
  const now = new Date();

  for (const [approvalId, approval] of approvalStore) {
    // Skip expired
    if (now > approval.expiresAt) {
      if (approval.status === 'PENDING') {
        approval.status = 'EXPIRED';
      }
      continue;
    }

    // Only include pending approvals where user is an approver and hasn't responded
    if (
      approval.status === 'PENDING' &&
      approval.config.approverIds.includes(userId) &&
      !approval.responses.some((r) => r.approverId === userId)
    ) {
      pending.push({
        id: approvalId,
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

function scheduleEscalation(
  approvalId: string,
  escalateAfterHours: number,
  escalateTo: string[]
): void {
  const delayMs = escalateAfterHours * 60 * 60 * 1000;

  setTimeout(async () => {
    const approval = approvalStore.get(approvalId);
    if (!approval || approval.status !== 'PENDING') return;

    // Notify escalation targets
    for (const userId of escalateTo) {
      await prisma.actionLog.create({
        data: {
          actor: 'SYSTEM',
          actionType: 'APPROVAL_ESCALATED',
          target: `approval:${approvalId}/escalation:${userId}`,
          reason: `Approval escalated after ${escalateAfterHours}h without resolution`,
          blastRadius: 'MEDIUM',
          reversible: false,
          status: 'EXECUTED',
        },
      });

      // Add escalation users as additional approvers
      if (!approval.config.approverIds.includes(userId)) {
        approval.config.approverIds.push(userId);
      }
    }
  }, delayMs);
}

// --- Testing Helpers ---

export function clearApprovalStore(): void {
  approvalStore.clear();
  approvalCounter = 0;
}

export function getApprovalStoreSize(): number {
  return approvalStore.size;
}
