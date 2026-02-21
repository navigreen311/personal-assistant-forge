import { prisma } from '@/lib/db';
import { generateText, generateJSON } from '@/lib/ai';
import type { Call, Contact } from '@prisma/client';
import type { CallAnalytics } from '../types';

// --- Core call analytics (Phase 2) ---

export async function getCallAnalytics(
  entityId: string,
  startDate: Date,
  endDate: Date
): Promise<CallAnalytics> {
  const calls = await prisma.call.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const totalCalls = calls.length;

  // Connect rate: calls with outcome CONNECTED / total calls
  const connected = calls.filter((c: Call) => c.outcome === 'CONNECTED').length;
  const connectRate =
    totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0;

  // Average duration (seconds)
  const callsWithDuration = calls.filter((c: Call) => c.duration != null);
  const averageDuration =
    callsWithDuration.length > 0
      ? Math.round(
          callsWithDuration.reduce((sum: number, c: Call) => sum + (c.duration ?? 0), 0) /
            callsWithDuration.length
        )
      : 0;

  // Outcome distribution
  const outcomeDistribution: Record<string, number> = {};
  for (const call of calls) {
    const outcome = call.outcome ?? 'UNKNOWN';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] ?? 0) + 1;
  }

  // Sentiment average
  const callsWithSentiment = calls.filter((c: Call) => c.sentiment != null);
  const sentimentAverage =
    callsWithSentiment.length > 0
      ? Math.round(
          (callsWithSentiment.reduce(
            (sum: number, c: Call) => sum + (c.sentiment ?? 0),
            0
          ) /
            callsWithSentiment.length) *
            100
        ) / 100
      : 0;

  // ROI per call type (by direction)
  const callsByDirection = new Map<
    string,
    { count: number; totalDuration: number }
  >();
  for (const call of calls) {
    const type = call.direction;
    const existing = callsByDirection.get(type) ?? {
      count: 0,
      totalDuration: 0,
    };
    existing.count++;
    existing.totalDuration += call.duration ?? 0;
    callsByDirection.set(type, existing);
  }

  const roiPerCallType = Array.from(callsByDirection.entries()).map(
    ([callType, data]) => {
      const avgDuration = data.totalDuration / data.count;
      const averageCost = Math.round((avgDuration / 60) * 25 * 100) / 100;
      const averageRevenue =
        callType === 'OUTBOUND'
          ? Math.round(averageCost * 3 * 100) / 100
          : Math.round(averageCost * 2 * 100) / 100;
      const roi =
        averageCost > 0
          ? Math.round(((averageRevenue - averageCost) / averageCost) * 100)
          : 0;
      return { callType, averageRevenue, averageCost, roi };
    }
  );

  const period = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;

  // Generate AI-powered call performance insights
  let insights: string[] = [];
  if (totalCalls > 0) {
    try {
      const insightText = await generateText(
        `You are a call analytics advisor. Analyze this call performance data and provide 2-3 brief, actionable insights.

Total calls: ${totalCalls}
Connect rate: ${connectRate}%
Average duration: ${averageDuration} seconds
Sentiment average: ${sentimentAverage}
Outcome distribution: ${JSON.stringify(outcomeDistribution)}
ROI per call type: ${JSON.stringify(roiPerCallType)}

Provide 2-3 insights, each one sentence. Separate them with newlines.`,
        { temperature: 0.7, maxTokens: 256 }
      );
      insights = insightText.split('\n').filter((line) => line.trim().length > 0);
    } catch {
      if (connectRate < 50) {
        insights.push(`Connect rate is low at ${connectRate}%. Consider reviewing call timing and lead quality.`);
      }
      if (sentimentAverage < 0.5 && sentimentAverage > 0) {
        insights.push(`Sentiment is below average at ${sentimentAverage}. Review call scripts and agent training.`);
      }
    }
  }

  return {
    entityId,
    period,
    totalCalls,
    connectRate,
    averageDuration,
    outcomeDistribution,
    sentimentAverage,
    roiPerCallType,
    insights,
  };
}

export async function getCallTrend(
  entityId: string,
  days: number
): Promise<{ date: string; calls: number; connectRate: number }[]> {
  const trend: { date: string; calls: number; connectRate: number }[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const calls = await prisma.call.findMany({
      where: {
        entityId,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const connectedCount = calls.filter((c: Call) => c.outcome === 'CONNECTED').length;
    const connectRate =
      calls.length > 0 ? Math.round((connectedCount / calls.length) * 100) : 0;

    trend.push({
      date: dayStart.toISOString().split('T')[0],
      calls: calls.length,
      connectRate,
    });
  }

  return trend;
}

// --- Additional analytics functions (Phase 3) ---

export async function getCallsPerPeriod(
  entityId: string,
  period: 'day' | 'week' | 'month',
  dateRange?: { start: Date; end: Date }
): Promise<{ period: string; count: number }[]> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const calls = await prisma.call.findMany({ where });

  const groups = new Map<string, number>();
  for (const call of calls) {
    const d = new Date(call.createdAt);
    let key: string;
    if (period === 'day') {
      key = d.toISOString().split('T')[0];
    } else if (period === 'week') {
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, count]) => ({ period: p, count }));
}

export async function getAverageDuration(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<number> {
  const where: Record<string, unknown> = {
    entityId,
    duration: { not: null },
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const result = await prisma.call.aggregate({
    where,
    _avg: { duration: true },
  });

  return Math.round(result._avg.duration ?? 0);
}

export async function getSentimentDistribution(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<{ positive: number; neutral: number; negative: number }> {
  const where: Record<string, unknown> = {
    entityId,
    sentiment: { not: null },
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const calls = await prisma.call.findMany({ where });
  if (calls.length === 0) {
    return { positive: 0, neutral: 0, negative: 0 };
  }

  let positive = 0;
  let neutral = 0;
  let negative = 0;

  for (const call of calls) {
    const s = call.sentiment as number;
    if (s > 0.3) positive++;
    else if (s < -0.3) negative++;
    else neutral++;
  }

  const total = calls.length;
  return {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100),
  };
}

export async function getOutcomeRates(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<{ outcome: string; count: number; percentage: number }[]> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const calls = await prisma.call.findMany({ where });
  const total = calls.length;
  if (total === 0) return [];

  const outcomeMap = new Map<string, number>();
  for (const call of calls) {
    const outcome = call.outcome ?? 'UNKNOWN';
    outcomeMap.set(outcome, (outcomeMap.get(outcome) ?? 0) + 1);
  }

  return Array.from(outcomeMap.entries()).map(([outcome, count]) => ({
    outcome,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

export async function getTopCallers(
  entityId: string,
  limit = 10,
  dateRange?: { start: Date; end: Date }
): Promise<{ contactId: string; contactName: string; callCount: number }[]> {
  const where: Record<string, unknown> = {
    entityId,
    contactId: { not: null },
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const calls = await prisma.call.findMany({ where });

  const contactCounts = new Map<string, number>();
  for (const call of calls) {
    if (call.contactId) {
      contactCounts.set(
        call.contactId,
        (contactCounts.get(call.contactId) ?? 0) + 1
      );
    }
  }

  const topContactIds = Array.from(contactCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (topContactIds.length === 0) return [];

  const contacts = await prisma.contact.findMany({
    where: { id: { in: topContactIds.map(([id]) => id) } },
    select: { id: true, name: true },
  });

  const contactMap = new Map<string, string>(
    contacts.map((c: Pick<Contact, 'id' | 'name'>) => [c.id, c.name])
  );

  return topContactIds.map(([contactId, callCount]) => ({
    contactId,
    contactName: contactMap.get(contactId) ?? 'Unknown',
    callCount,
  }));
}

export async function getCallTrends(
  entityId: string
): Promise<{ insights: string[]; busiestHour?: number; sentimentTrend?: string }> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const calls = await prisma.call.findMany({
    where: {
      entityId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  if (calls.length === 0) {
    return { insights: ['No call data available for trend analysis.'] };
  }

  // Pre-compute stats for AI prompt
  const outcomes: Record<string, number> = {};
  for (const c of calls) {
    const o = c.outcome ?? 'UNKNOWN';
    outcomes[o] = (outcomes[o] ?? 0) + 1;
  }
  const withSentiment = calls.filter((c: Call) => c.sentiment != null);
  const avgSentiment = withSentiment.length > 0
    ? (withSentiment.reduce((s: number, c: Call) => s + (c.sentiment ?? 0), 0) / withSentiment.length).toFixed(2)
    : 'N/A';
  const withDuration = calls.filter((c: Call) => c.duration != null);
  const avgDur = withDuration.length > 0
    ? Math.round(withDuration.reduce((s: number, c: Call) => s + (c.duration ?? 0), 0) / withDuration.length)
    : 0;

  try {
    const result = await generateJSON<{
      insights: string[];
      busiestHour?: number;
      sentimentTrend?: string;
    }>(
      `Analyze this call data and provide trend insights in JSON format { "insights": ["..."], "busiestHour": <0-23>, "sentimentTrend": "improving|stable|declining" }.

Total calls (30 days): ${calls.length}
Outcomes: ${JSON.stringify(outcomes)}
Avg sentiment: ${avgSentiment}
Avg duration: ${avgDur}s

Provide 2-3 actionable insights.`,
      { temperature: 0.5, maxTokens: 256 }
    );
    return result;
  } catch {
    return {
      insights: [`${calls.length} calls in the last 30 days. Connect and review sentiment trends manually.`],
    };
  }
}
