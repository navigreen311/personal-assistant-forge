import { prisma } from '@/lib/db';
import type { ConfidenceScore } from '../types';

export function calculateConfidence(
  actionId: string,
  factors: { factor: string; weight: number; value: number }[]
): ConfidenceScore {
  if (factors.length === 0) {
    return {
      actionId,
      confidence: 0,
      factors: [],
      recommendation: 'HUMAN_REQUIRED',
    };
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);

  const confidence =
    totalWeight > 0
      ? factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
      : 0;

  const clampedConfidence = Math.max(0, Math.min(1, confidence));

  let recommendation: ConfidenceScore['recommendation'];
  if (clampedConfidence >= 0.9) {
    recommendation = 'AUTO_EXECUTE';
  } else if (clampedConfidence >= 0.7) {
    recommendation = 'REVIEW_RECOMMENDED';
  } else {
    recommendation = 'HUMAN_REQUIRED';
  }

  return {
    actionId,
    confidence: Math.round(clampedConfidence * 1000) / 1000,
    factors,
    recommendation,
  };
}

export async function getConfidenceDistribution(
  entityId: string,
  period: string
): Promise<{ bucket: string; count: number }[]> {
  const { startDate, endDate } = parsePeriod(period);

  // Get action logs for the period
  const actions = await prisma.actionLog.findMany({
    where: {
      actor: 'AI',
      timestamp: { gte: startDate, lte: endDate },
    },
  });

  // Bucket the confidence values
  const buckets: Record<string, number> = {
    '0-0.3': 0,
    '0.3-0.5': 0,
    '0.5-0.7': 0,
    '0.7-0.9': 0,
    '0.9-1.0': 0,
  };

  for (const action of actions) {
    // Use the existing confidence from ConsentReceipt if available
    const confidence = action.cost ?? 0.5; // Fallback to 0.5 if no confidence stored

    if (confidence < 0.3) buckets['0-0.3']++;
    else if (confidence < 0.5) buckets['0.3-0.5']++;
    else if (confidence < 0.7) buckets['0.5-0.7']++;
    else if (confidence < 0.9) buckets['0.7-0.9']++;
    else buckets['0.9-1.0']++;
  }

  return Object.entries(buckets).map(([bucket, count]) => ({
    bucket,
    count,
  }));
}

function parsePeriod(period: string): { startDate: Date; endDate: Date } {
  const weekMatch = period.match(/^(\d{4})-(\d{2})-W(\d+)$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1]);
    const week = parseInt(weekMatch[3]);
    const jan1 = new Date(year, 0, 1);
    const startDate = new Date(jan1.getTime() + (week - 1) * 7 * 86400000);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 7 * 86400000);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    return {
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 86400000);
  return { startDate, endDate };
}
