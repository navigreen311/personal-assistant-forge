import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { CallAnalytics } from '../types';

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
  const connected = calls.filter((c: any) => c.outcome === 'CONNECTED').length;
  const connectRate =
    totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0;

  // Average duration (seconds)
  const callsWithDuration = calls.filter((c: any) => c.duration != null);
  const averageDuration =
    callsWithDuration.length > 0
      ? Math.round(
          callsWithDuration.reduce((sum: number, c: any) => sum + (c.duration ?? 0), 0) /
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
  const callsWithSentiment = calls.filter((c: any) => c.sentiment != null);
  const sentimentAverage =
    callsWithSentiment.length > 0
      ? Math.round(
          (callsWithSentiment.reduce(
            (sum: number, c: any) => sum + (c.sentiment ?? 0), 
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
      // Estimate: revenue from connected calls, cost from time spent
      const avgDuration = data.totalDuration / data.count;
      const averageCost = Math.round((avgDuration / 60) * 25 * 100) / 100; // $25/hr
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

    const connected = calls.filter((c: any) => c.outcome === 'CONNECTED').length;
    const connectRate =
      calls.length > 0 ? Math.round((connected / calls.length) * 100) : 0;

    trend.push({
      date: dayStart.toISOString().split('T')[0],
      calls: calls.length,
      connectRate,
    });
  }

  return trend;
}
