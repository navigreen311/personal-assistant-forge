import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { DelegationScore } from '../types';
import { delegationStore } from './delegation-service';

export async function calculateScore(delegateeId: string): Promise<DelegationScore> {
  const delegations = Array.from(delegationStore.values()).filter(
    (d) => d.delegatedTo === delegateeId
  );

  if (delegations.length === 0) {
    return {
      delegateeId,
      delegateeName: '',
      categories: [],
      overallScore: 0,
      bestCategory: '',
      totalTasksDelegated: 0,
    };
  }

  const completed = delegations.filter((d) => d.status === 'COMPLETED');
  const completionRate = delegations.length > 0 ? completed.length / delegations.length : 0;

  const firstPassApproved = delegations.filter((d) => {
    const userApproval = d.approvalChain.find((s) => s.role === 'USER_APPROVE');
    return userApproval?.status === 'APPROVED';
  });
  const qualityRate = delegations.length > 0 ? firstPassApproved.length / delegations.length : 0;

  const speedScore = completed
    .filter((d) => d.completedAt && d.delegatedAt)
    .reduce((acc, d) => {
      const hours = (d.completedAt!.getTime() - d.delegatedAt.getTime()) / (1000 * 60 * 60);
      return acc + Math.max(0, 1 - hours / 72);
    }, 0);
  const avgSpeed = completed.length > 0 ? speedScore / completed.length : 0;

  // Quality weighted highest (50%), completion (30%), speed (20%)
  const overallScore = Math.round((qualityRate * 50 + completionRate * 30 + avgSpeed * 20));

  const categoryMap = new Map<string, { completed: number; total: number; quality: number }>();
  for (const d of delegations) {
    const category = 'general';
    const existing = categoryMap.get(category) || { completed: 0, total: 0, quality: 0 };
    existing.total++;
    if (d.status === 'COMPLETED') existing.completed++;
    const approved = d.approvalChain.find((s) => s.role === 'USER_APPROVE')?.status === 'APPROVED';
    if (approved) existing.quality++;
    categoryMap.set(category, existing);
  }

  const categories = Array.from(categoryMap.entries()).map(([category, stats]) => ({
    category,
    score: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
    tasksCompleted: stats.completed,
    averageQuality: stats.total > 0 ? stats.quality / stats.total : 0,
  }));

  const bestCategory = categories.length > 0
    ? categories.reduce((best, c) => (c.score > best.score ? c : best)).category
    : '';

  return {
    delegateeId,
    delegateeName: '',
    categories,
    overallScore,
    bestCategory,
    totalTasksDelegated: delegations.length,
  };
}

export async function getBestDelegate(
  category: string,
  entityId: string
): Promise<{ delegateeId: string; score: number } | null> {
  const allDelegatees = new Set<string>();
  for (const d of delegationStore.values()) {
    allDelegatees.add(d.delegatedTo);
  }

  let best: { delegateeId: string; score: number } | null = null;
  for (const delegateeId of allDelegatees) {
    const score = await calculateScore(delegateeId);
    if (!best || score.overallScore > best.score) {
      best = { delegateeId, score: score.overallScore };
    }
  }

  return best;
}

export async function getScoreboard(entityId: string): Promise<DelegationScore[]> {
  const allDelegatees = new Set<string>();
  for (const d of delegationStore.values()) {
    allDelegatees.add(d.delegatedTo);
  }

  const scores: DelegationScore[] = [];
  for (const delegateeId of allDelegatees) {
    scores.push(await calculateScore(delegateeId));
  }

  return scores.sort((a, b) => b.overallScore - a.overallScore);
}

interface TaskLike {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  tags?: string[];
}

interface DelegateLike {
  id: string;
  name: string;
  preferences?: Record<string, unknown>;
  role?: string;
}

interface DelegatabilityResult {
  delegateId: string;
  delegateName: string;
  score: number;
  reasons: string[];
}

export async function scoreDelegatability(
  task: TaskLike,
  delegates: DelegateLike[]
): Promise<DelegatabilityResult[]> {
  const results: DelegatabilityResult[] = [];

  for (const delegate of delegates) {
    const activeTasks = await prisma.task.count({
      where: { assigneeId: delegate.id, status: { in: ['TODO', 'IN_PROGRESS', 'PENDING'] } },
    });

    const completedDelegations = await prisma.actionLog.count({
      where: {
        actorId: delegate.id,
        actionType: 'DELEGATE',
        status: 'COMPLETED',
      },
    });

    // Heuristic scoring
    const complexityScore = Math.min(1, (task.description?.length || 0) / 500);
    const workloadScore = Math.max(0, 1 - activeTasks / 10);
    const experienceScore = Math.min(1, completedDelegations / 20);
    const heuristicScore = (workloadScore * 0.4 + experienceScore * 0.35 + (1 - complexityScore) * 0.25);

    results.push({
      delegateId: delegate.id,
      delegateName: delegate.name,
      score: Math.round(heuristicScore * 100) / 100,
      reasons: [
        `Workload: ${activeTasks} active tasks`,
        `Experience: ${completedDelegations} completed delegations`,
        `Task complexity: ${complexityScore < 0.5 ? 'low' : 'high'}`,
      ],
    });
  }

  // Try AI scoring for nuanced analysis
  if (delegates.length > 0) {
    try {
      const aiResult = await generateJSON<{ scores: { delegateId: string; score: number; reason: string }[] }>(
        `Score these delegates for the given task. Return a score from 0 to 1 for each.

Task: "${task.title}" (priority: ${task.priority})
Description: ${task.description || 'No description'}

Delegates:
${delegates.map((d) => `- ${d.id}: ${d.name} (role: ${d.role || 'member'})`).join('\n')}

Return JSON: { "scores": [{ "delegateId": "...", "score": 0.0-1.0, "reason": "..." }] }`,
        { temperature: 0.3, maxTokens: 512 }
      );

      if (aiResult.scores && Array.isArray(aiResult.scores)) {
        for (const aiScore of aiResult.scores) {
          const existing = results.find((r) => r.delegateId === aiScore.delegateId);
          if (existing) {
            // Blend AI score with heuristic (60% AI, 40% heuristic)
            existing.score = Math.round((aiScore.score * 0.6 + existing.score * 0.4) * 100) / 100;
            existing.reasons.push(aiScore.reason);
          }
        }
      }
    } catch {
      // Keep heuristic scores on AI failure
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function scoreTask(task: TaskLike): Promise<number> {
  const descLength = task.description?.length || 0;
  const isLowPriority = task.priority === 'P2' || task.priority === 'P1';
  const hasDescription = descLength > 20;

  // Simple heuristic: tasks are more delegatable if lower priority, well-described, and not blocked
  let score = 0;
  if (isLowPriority) score += 0.3;
  if (hasDescription) score += 0.2;
  if (task.status === 'TODO') score += 0.2;
  if (descLength > 100) score += 0.1;
  if ((task.tags || []).length > 0) score += 0.1;

  // Cap at 1.0
  score = Math.min(1, score);

  try {
    const aiResult = await generateJSON<{ delegatability: number }>(
      `Rate how delegatable this task is on a scale of 0.0 to 1.0.

Task: "${task.title}"
Priority: ${task.priority}
Status: ${task.status}
Description: ${task.description || 'No description'}

Consider: complexity, clarity of requirements, risk, need for domain expertise.
Return JSON: { "delegatability": 0.0-1.0 }`,
      { temperature: 0.3, maxTokens: 64 }
    );

    if (typeof aiResult.delegatability === 'number') {
      // Blend: 60% AI, 40% heuristic
      score = aiResult.delegatability * 0.6 + score * 0.4;
    }
  } catch {
    // Keep heuristic score
  }

  return Math.round(score * 100) / 100;
}
