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
