import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
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

export async function completeDelegation(delegationId: string): Promise<DelegationTask> {
  const delegation = delegationStore.get(delegationId);
  if (!delegation) throw new Error(`Delegation ${delegationId} not found`);

  delegation.status = 'COMPLETED';
  delegation.completedAt = new Date();
  delegationStore.set(delegationId, delegation);
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

  return {
    summary: `Context for task: ${task.title}${task.description ? ' - ' + task.description : ''}`,
    relevantDocuments: documents.map((d: { id: string }) => d.id),
    relevantMessages: messages.map((m: { id: string }) => m.id),
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
