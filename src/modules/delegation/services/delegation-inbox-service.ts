import { prisma } from '@/lib/db';
import { generateJSON, generateText } from '@/lib/ai';
import type { DelegationInboxItem } from '../types';
import { scoreTask } from './delegation-scoring-service';

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

  const fallbackSuggestions: DelegationInboxItem[] = tasks.map((task: { id: string; title: string; priority: string; status: string; entityId: string }) => {
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

  if (tasks.length === 0) return [];

  try {
    const taskDescriptions = tasks.map((t: { id: string; title: string; priority: string; status: string }) =>
      `- [${t.id}] "${t.title}" (priority: ${t.priority}, status: ${t.status})`
    ).join('\n');

    const aiResult = await generateJSON<{ suggestions: { taskId: string; confidence: number; priority: 'HIGH' | 'MEDIUM' | 'LOW'; estimatedTimeSavedMinutes: number; reason: string }[] }>(
      `Analyze these tasks and identify the best delegation opportunities. Score and rank them.

Tasks:
${taskDescriptions}

For each task, provide:
- taskId: the task ID
- confidence: 0-1 score for how delegatable this task is
- priority: HIGH, MEDIUM, or LOW
- estimatedTimeSavedMinutes: estimated time saved by delegating
- reason: brief explanation of why this task is delegatable

Return JSON: { "suggestions": [...] }`,
      { temperature: 0.5, maxTokens: 1024 }
    );

    if (aiResult.suggestions && Array.isArray(aiResult.suggestions)) {
      const suggestions: DelegationInboxItem[] = aiResult.suggestions.map((s) => {
        const task = tasks.find((t: { id: string }) => t.id === s.taskId);
        return {
          taskId: s.taskId,
          taskTitle: task?.title || '',
          reason: s.reason,
          suggestedDelegatee: '',
          estimatedTimeSavedMinutes: s.estimatedTimeSavedMinutes,
          confidence: s.confidence,
          priority: s.priority,
        };
      });
      return suggestions.slice(0, 10);
    }
  } catch {
    // Fall back to static scoring
  }

  return fallbackSuggestions.slice(0, 10);
}

export async function getDailySuggestions(userId: string): Promise<DelegationInboxItem[]> {
  const inbox = await generateDelegationInbox(userId);
  const top = inbox.slice(0, 5);

  // Enhance each suggestion with AI-generated reason if not already AI-generated
  for (const item of top) {
    try {
      item.reason = await generateText(
        `Explain in one sentence why the task "${item.taskTitle}" (priority: ${item.priority}) is a good candidate for delegation.`,
        { temperature: 0.5, maxTokens: 100 }
      );
    } catch {
      // Keep existing reason on failure
    }
  }

  return top;
}

export async function getDelegatableTasks(entityId: string): Promise<Array<{
  id: string;
  title: string;
  priority: string;
  status: string;
  delegatabilityScore: number;
}>> {
  const tasks = await prisma.task.findMany({
    where: {
      entityId,
      assigneeId: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const results = [];
  for (const task of tasks) {
    const delegatabilityScore = await scoreTask({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      tags: task.tags,
    });

    // Store score in createdFrom JSON field
    const existingMeta = (task.createdFrom as Record<string, unknown>) || {};
    await prisma.task.update({
      where: { id: task.id },
      data: {
        createdFrom: { ...existingMeta, delegatabilityScore },
      },
    });

    results.push({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      delegatabilityScore,
    });
  }

  return results.sort((a, b) => b.delegatabilityScore - a.delegatabilityScore);
}

export async function getInboxForDelegate(userId: string, entityId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      entityId,
      status: { in: ['IN_PROGRESS', 'PENDING'] },
    },
    orderBy: [
      { priority: 'asc' },
      { dueDate: 'asc' },
    ],
  });

  return tasks;
}

export async function assignTask(taskId: string, assigneeId: string, assignedBy: string) {
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      assigneeId,
      status: 'PENDING',
    },
  });

  await prisma.actionLog.create({
    data: {
      actor: assignedBy,
      actorId: assignedBy,
      actionType: 'DELEGATE',
      target: taskId,
      reason: `Task "${task.title}" delegated to ${assigneeId}`,
      blastRadius: 'LOW',
      reversible: true,
      status: 'COMPLETED',
    },
  });

  return task;
}

export async function getDelegationStats(entityId: string) {
  const tasks = await prisma.task.findMany({
    where: { entityId, assigneeId: { not: null } },
  });

  const statusCounts: Record<string, number> = {};
  for (const task of tasks) {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
  }

  const completedTasks = tasks.filter((t: { status: string }) => t.status === 'COMPLETED');
  const totalCompletionMs = completedTasks.reduce((acc: number, t: { updatedAt: Date; createdAt: Date }) => {
    return acc + (t.updatedAt.getTime() - t.createdAt.getTime());
  }, 0);
  const avgCompletionTimeMs = completedTasks.length > 0 ? totalCompletionMs / completedTasks.length : 0;

  const successRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;

  return {
    totalDelegated: tasks.length,
    byStatus: statusCounts,
    avgCompletionTimeMs,
    successRate: Math.round(successRate * 100) / 100,
  };
}
