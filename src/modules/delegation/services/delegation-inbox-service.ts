import { prisma } from '@/lib/db';
import { generateJSON, generateText } from '@/lib/ai';
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
