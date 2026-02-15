import { prisma } from '@/lib/db';
import type { DelegationInboxItem } from '../types';

export async function generateDelegationInbox(userId: string): Promise<DelegationInboxItem[]> {
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      status: { in: ['TODO', 'IN_PROGRESS'] },
      priority: { not: 'P0' },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const suggestions: DelegationInboxItem[] = tasks.map((task: { id: string; title: string; priority: string; status: string; entityId: string }) => {
    const priorityMap: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = {
      P1: 'MEDIUM',
      P2: 'LOW',
    };

    return {
      taskId: task.id,
      taskTitle: task.title,
      reason: `Task is ${task.priority} priority and can be delegated to free up focus time`,
      suggestedDelegatee: '',
      estimatedTimeSavedMinutes: task.priority === 'P1' ? 30 : 15,
      confidence: task.priority === 'P2' ? 0.85 : 0.65,
      priority: priorityMap[task.priority] || 'LOW',
    };
  });

  return suggestions.slice(0, 10);
}

export async function getDailySuggestions(userId: string): Promise<DelegationInboxItem[]> {
  const inbox = await generateDelegationInbox(userId);
  return inbox.slice(0, 5);
}
