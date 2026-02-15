import { prisma } from '@/lib/db';
import type { TrustScoreBreakdown } from './types';

export async function calculateTrustScore(
  domain: string,
  userId: string
): Promise<TrustScoreBreakdown> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get action logs for this domain and user
  const actionLogs = await prisma.actionLog.findMany({
    where: {
      actorId: userId,
      actionType: { contains: domain },
      timestamp: { gte: thirtyDaysAgo },
    },
  });

  const totalActions = actionLogs.length;
  if (totalActions === 0) {
    return {
      domain,
      overallScore: 50,
      dimensions: {
        accuracy: 50,
        transparency: 50,
        reversibility: 50,
        userOverrideRate: 0,
      },
      trend: 'STABLE',
      sampleSize: 0,
    };
  }

  // Calculate accuracy: ratio of successful executions
  const executed = actionLogs.filter((l) => l.status === 'EXECUTED').length;
  const failed = actionLogs.filter((l) => l.status === 'FAILED').length;
  const accuracy = totalActions > 0 ? ((executed - failed) / totalActions) * 100 : 50;

  // Calculate transparency: ratio of actions with consent receipts
  const actionIds = actionLogs.map((l) => l.id);
  const receipts = await prisma.consentReceipt.findMany({
    where: { actionId: { in: actionIds } },
  });
  const transparency =
    totalActions > 0 ? (receipts.length / totalActions) * 100 : 50;

  // Calculate reversibility: ratio of reversible actions
  const reversibleCount = actionLogs.filter((l) => l.reversible).length;
  const reversibility =
    totalActions > 0 ? (reversibleCount / totalActions) * 100 : 50;

  // Calculate override rate: ratio of rolled-back actions
  const overriddenCount = actionLogs.filter(
    (l) => l.status === 'ROLLED_BACK'
  ).length;
  const userOverrideRate =
    totalActions > 0 ? (overriddenCount / totalActions) * 100 : 0;

  // Overall score: weighted average
  const overallScore = Math.round(
    accuracy * 0.4 + transparency * 0.2 + reversibility * 0.2 + (100 - userOverrideRate) * 0.2
  );

  // Determine trend by comparing to previous period
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const previousLogs = await prisma.actionLog.findMany({
    where: {
      actorId: userId,
      actionType: { contains: domain },
      timestamp: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
    },
  });

  let trend: TrustScoreBreakdown['trend'] = 'STABLE';
  if (previousLogs.length > 0) {
    const prevExecuted = previousLogs.filter((l) => l.status === 'EXECUTED').length;
    const prevAccuracy = (prevExecuted / previousLogs.length) * 100;
    if (accuracy > prevAccuracy + 5) trend = 'IMPROVING';
    else if (accuracy < prevAccuracy - 5) trend = 'DECLINING';
  }

  return {
    domain,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    dimensions: {
      accuracy: Math.max(0, Math.min(100, Math.round(accuracy))),
      transparency: Math.max(0, Math.min(100, Math.round(transparency))),
      reversibility: Math.max(0, Math.min(100, Math.round(reversibility))),
      userOverrideRate: Math.max(0, Math.min(100, Math.round(userOverrideRate))),
    },
    trend,
    sampleSize: totalActions,
  };
}

const DEFAULT_DOMAINS = [
  'EMAIL',
  'CALENDAR',
  'TASK',
  'DOCUMENT',
  'FINANCIAL',
  'COMMUNICATION',
];

export async function getTrustScores(
  userId: string
): Promise<TrustScoreBreakdown[]> {
  const scores = await Promise.all(
    DEFAULT_DOMAINS.map((domain) => calculateTrustScore(domain, userId))
  );
  return scores;
}

export async function getTrustTrend(
  domain: string,
  userId: string,
  days = 30
): Promise<{ date: Date; score: number }[]> {
  const results: { date: Date; score: number }[] = [];

  for (let i = days; i >= 0; i -= 7) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 7);

    const logs = await prisma.actionLog.findMany({
      where: {
        actorId: userId,
        actionType: { contains: domain },
        timestamp: { gte: date, lt: dayEnd },
      },
    });

    const executed = logs.filter((l) => l.status === 'EXECUTED').length;
    const score = logs.length > 0 ? Math.round((executed / logs.length) * 100) : 50;

    results.push({ date, score });
  }

  return results;
}
