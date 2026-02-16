import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type { OverrideRecord, OverrideAnalysis } from '../types';

// In-memory store for overrides
const overrideStore: OverrideRecord[] = [];

export async function recordOverride(
  actionId: string,
  userId: string,
  originalOutput: string,
  overriddenOutput: string,
  reason: string,
  reasonDetail?: string
): Promise<OverrideRecord> {
  const record: OverrideRecord = {
    id: uuidv4(),
    actionId,
    userId,
    originalOutput,
    overriddenOutput,
    reason: reason as OverrideRecord['reason'],
    reasonDetail,
    timestamp: new Date(),
  };

  overrideStore.push(record);
  return record;
}

export async function analyzeOverrides(
  entityId: string,
  period: string
): Promise<OverrideAnalysis> {
  const { startDate, endDate } = parsePeriod(period);

  // Filter overrides by period
  const periodOverrides = overrideStore.filter(
    (o) => o.timestamp >= startDate && o.timestamp <= endDate
  );

  // Get total AI actions for the period
  const totalActions = await prisma.actionLog.count({
    where: {
      actor: 'AI',
      timestamp: { gte: startDate, lte: endDate },
    },
  });

  // Count by reason
  const byReason: Record<string, number> = {};
  for (const override of periodOverrides) {
    byReason[override.reason] = (byReason[override.reason] ?? 0) + 1;
  }

  const overrideRate =
    totalActions > 0
      ? Math.round((periodOverrides.length / totalActions) * 10000) / 10000
      : 0;

  // Determine trend by comparing with previous period
  const periodDuration = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodDuration);
  const prevOverrides = overrideStore.filter(
    (o) => o.timestamp >= prevStart && o.timestamp < startDate
  );

  let trend: OverrideAnalysis['trend'];
  if (prevOverrides.length === 0) {
    trend = 'STABLE';
  } else {
    const changeRate =
      (periodOverrides.length - prevOverrides.length) / prevOverrides.length;
    if (changeRate < -0.05) trend = 'IMPROVING';
    else if (changeRate > 0.05) trend = 'WORSENING';
    else trend = 'STABLE';
  }

  const topPatterns = getOverridePatterns_internal(periodOverrides);

  return {
    totalOverrides: periodOverrides.length,
    byReason,
    overrideRate,
    trend,
    topPatterns,
  };
}

export async function getOverridePatterns(
  entityId: string
): Promise<{ pattern: string; count: number; suggestedFix: string }[]> {
  return getOverridePatterns_internal(overrideStore);
}

function getOverridePatterns_internal(
  overrides: OverrideRecord[]
): { pattern: string; count: number; suggestedFix: string }[] {
  // Group by reason and look for common patterns
  const patternMap = new Map<
    string,
    { count: number; suggestedFix: string }
  >();

  const fixSuggestions: Record<string, string> = {
    INCORRECT:
      'Review training data and model prompts for factual accuracy.',
    INCOMPLETE:
      'Expand prompt context and add more detailed instructions.',
    WRONG_TONE:
      'Update tone guidelines in the user/entity preferences.',
    POLICY_VIOLATION:
      'Strengthen compliance rules and add guardrails.',
    PREFERENCE:
      'Record user preference patterns for personalization.',
    OTHER:
      'Investigate override details for new pattern categories.',
  };

  for (const override of overrides) {
    const pattern = override.reason;
    const existing = patternMap.get(pattern) ?? {
      count: 0,
      suggestedFix: fixSuggestions[pattern] ?? 'Review and analyze pattern.',
    };
    existing.count++;
    patternMap.set(pattern, existing);
  }

  return Array.from(patternMap.entries())
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      suggestedFix: data.suggestedFix,
    }))
    .sort((a, b) => b.count - a.count);
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

// Exported for testing
export function _getOverrideStore(): OverrideRecord[] {
  return overrideStore;
}
