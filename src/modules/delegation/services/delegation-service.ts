import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { DelegationTask, ContextPack, ApprovalStep } from '../types';

// In-memory store for delegations (since no dedicated Prisma model)
const delegationStore = new Map<string, DelegationTask>();

export async function delegateTask(
  taskId: string,
  delegatedBy: string,
  delegatedTo: string,
  contextPack: ContextPack
): Promise<DelegationTask> {
  const id = uuidv4();
  const approvalChain: ApprovalStep[] = [
    { order: 1, approverId: 'ai-system', approverName: 'AI Assistant', role: 'AI_DRAFT', status: 'PENDING' },
    { order: 2, approverId: delegatedTo, approverName: 'EA Reviewer', role: 'EA_REVIEW', status: 'PENDING' },
    { order: 3, approverId: delegatedBy, approverName: 'Task Owner', role: 'USER_APPROVE', status: 'PENDING' },
  ];

  const delegation: DelegationTask = {
    id,
    taskId,
    delegatedBy,
    delegatedTo,
    contextPack,
    approvalChain,
    status: 'PENDING',
    delegatedAt: new Date(),
  };

  delegationStore.set(id, delegation);
  return delegation;
}

export async function getDelegatedTasks(
  userId: string,
  direction: 'delegated_by' | 'delegated_to'
): Promise<DelegationTask[]> {
  const results: DelegationTask[] = [];
  for (const delegation of delegationStore.values()) {
    if (direction === 'delegated_by' && delegation.delegatedBy === userId) {
      results.push(delegation);
    } else if (direction === 'delegated_to' && delegation.delegatedTo === userId) {
      results.push(delegation);
    }
  }
  return results;
}

export async function advanceApproval(
  delegationId: string,
  stepOrder: number,
  status: 'APPROVED' | 'REJECTED',
  comments?: string
): Promise<DelegationTask> {
  const delegation = delegationStore.get(delegationId);
  if (!delegation) throw new Error(`Delegation ${delegationId} not found`);

  const step = delegation.approvalChain.find((s) => s.order === stepOrder);
  if (!step) throw new Error(`Approval step ${stepOrder} not found`);

  step.status = status;
  step.reviewedAt = new Date();
  if (comments) step.comments = comments;

  if (status === 'REJECTED') {
    delegation.status = 'REJECTED';
  } else {
    const allApproved = delegation.approvalChain.every(
      (s) => s.status === 'APPROVED' || s.status === 'SKIPPED'
    );
    if (allApproved) {
      delegation.status = 'APPROVED';
    } else {
      delegation.status = 'IN_REVIEW';
    }
  }

  delegationStore.set(delegationId, delegation);
  return delegation;
}

export async function completeDelegation(delegationId: string, completedBy?: string): Promise<DelegationTask> {
  const delegation = delegationStore.get(delegationId);
  if (!delegation) throw new Error(`Delegation ${delegationId} not found`);

  delegation.status = 'COMPLETED';
  delegation.completedAt = new Date();
  delegationStore.set(delegationId, delegation);

  // Update the task status in the database
  try {
    await prisma.task.update({
      where: { id: delegation.taskId },
      data: { status: 'COMPLETED' },
    });
    await prisma.actionLog.create({
      data: {
        actor: completedBy || delegation.delegatedTo,
        actorId: completedBy || delegation.delegatedTo,
        actionType: 'DELEGATE_COMPLETE',
        target: delegation.taskId,
        reason: `Delegation ${delegationId} completed`,
        blastRadius: 'LOW',
        reversible: false,
        status: 'COMPLETED',
      },
    });
  } catch {
    // DB logging is best-effort
  }

  return delegation;
}

export async function trackDelegation(taskId: string): Promise<{
  delegation: DelegationTask | null;
  assignedTo: string | null;
  assignedAt: Date | null;
  currentStatus: string;
  blockers: string[];
}> {
  let found: DelegationTask | null = null;
  for (const delegation of delegationStore.values()) {
    if (delegation.taskId === taskId) {
      found = delegation;
      break;
    }
  }

  if (!found) {
    return {
      delegation: null,
      assignedTo: null,
      assignedAt: null,
      currentStatus: 'NOT_DELEGATED',
      blockers: [],
    };
  }

  const blockers: string[] = [];
  for (const step of found.approvalChain) {
    if (step.status === 'REJECTED') {
      blockers.push(`${step.approverName} rejected at step ${step.order}: ${step.comments || 'no reason'}`);
    }
  }

  return {
    delegation: found,
    assignedTo: found.delegatedTo,
    assignedAt: found.delegatedAt,
    currentStatus: found.status,
    blockers,
  };
}

export async function revokeDelegation(delegationId: string, reason: string): Promise<DelegationTask> {
  const delegation = delegationStore.get(delegationId);
  if (!delegation) throw new Error(`Delegation ${delegationId} not found`);

  delegation.status = 'REJECTED';
  delegationStore.set(delegationId, delegation);

  // Reset the task in the database
  try {
    await prisma.task.update({
      where: { id: delegation.taskId },
      data: { assigneeId: null, status: 'TODO' },
    });
    await prisma.actionLog.create({
      data: {
        actor: delegation.delegatedBy,
        actorId: delegation.delegatedBy,
        actionType: 'DELEGATE_REVOKE',
        target: delegation.taskId,
        reason,
        blastRadius: 'LOW',
        reversible: true,
        status: 'COMPLETED',
      },
    });
  } catch {
    // DB logging is best-effort
  }

  return delegation;
}

export async function buildContextPack(taskId: string): Promise<ContextPack> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const documents = await prisma.document.findMany({
    where: { entityId: task.entityId },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  const messages = await prisma.message.findMany({
    where: { entityId: task.entityId },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  const docIds = documents.map((d: { id: string }) => d.id);
  const msgIds = messages.map((m: { id: string }) => m.id);

  let summary = `Context for task: ${task.title}${task.description ? ' - ' + task.description : ''}`;
  try {
    summary = await generateText(
      `Summarize the following task context for a delegate who will take over this work.

Task: ${task.title}
Description: ${task.description || 'No description'}
Due Date: ${task.dueDate ? task.dueDate.toISOString() : 'No due date'}
Related Documents: ${docIds.length} documents
Recent Messages: ${msgIds.length} messages

Produce a concise context summary (2-3 sentences) that helps the delegate understand the task scope, urgency, and key considerations.`,
      { temperature: 0.5, maxTokens: 256 }
    );
  } catch {
    // Fallback to static summary if AI fails
  }

  return {
    summary,
    relevantDocuments: docIds,
    relevantMessages: msgIds,
    relevantContacts: [],
    deadlines: task.dueDate
      ? [{ description: 'Task due date', date: task.dueDate }]
      : [],
    notes: '',
    permissions: ['tasks.read', 'tasks.write', 'documents.read'],
  };
}

// Export for testing
export { delegationStore };
