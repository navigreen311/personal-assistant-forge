import { subDays, format } from 'date-fns';
import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { SleepData, SleepOptimization } from '../types';

// === Sleep Score Calculation ===

interface SleepMetadata {
  deepSleepHours?: number;
  remSleepHours?: number;
  lightSleepHours?: number;
  awakeMinutes?: number;
  bedTime?: string;
  wakeTime?: string;
}

function calculateSleepScore(totalHours: number, meta: SleepMetadata): number {
  const deepHours = meta.deepSleepHours ?? totalHours * 0.2;
  const remHours = meta.remSleepHours ?? totalHours * 0.25;
  const awakeMin = meta.awakeMinutes ?? 15;

  const deepPct = totalHours > 0 ? deepHours / totalHours : 0;
  const remPct = totalHours > 0 ? remHours / totalHours : 0;
  const awakePct = totalHours > 0 ? (awakeMin / 60) / totalHours : 0;

  // Consistency bonus: 7-9 hours is ideal
  const idealDiff = Math.abs(totalHours - 8);
  const consistencyBonus = Math.max(0, 1 - idealDiff / 4);

  const score =
    deepPct * 35 +
    remPct * 30 +
    (1 - awakePct) * 20 +
    consistencyBonus * 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function mapDbToSleepData(record: {
  value: number;
  metadata: unknown;
  recordedAt: Date;
}): SleepData {
  const meta = (record.metadata as SleepMetadata) ?? {};
  const totalHours = record.value;

  return {
    date: format(record.recordedAt, 'yyyy-MM-dd'),
    totalHours,
    deepSleepHours: meta.deepSleepHours ?? 0,
    remSleepHours: meta.remSleepHours ?? 0,
    lightSleepHours: meta.lightSleepHours ?? 0,
    awakeMinutes: meta.awakeMinutes ?? 0,
    sleepScore: calculateSleepScore(totalHours, meta),
    bedTime: meta.bedTime ?? '22:30',
    wakeTime: meta.wakeTime ?? '06:30',
  };
}

// === Public API ===

export async function getSleepHistory(userId: string, days: number): Promise<SleepData[]> {
  const records = await prisma.healthMetric.findMany({
    where: {
      entityId: userId,
      type: 'sleep',
      recordedAt: { gte: subDays(new Date(), days) },
    },
    orderBy: { recordedAt: 'desc' },
  });

  return records.map(mapDbToSleepData);
}

export async function analyzeSleepPatterns(userId: string): Promise<SleepOptimization> {
  const data = await getSleepHistory(userId, 30);

  if (data.length === 0) {
    return {
      userId,
      averageSleepScore: 0,
      idealBedTime: '22:30',
      idealWakeTime: '06:30',
      correlations: [],
      recommendations: ['Insufficient data to analyze sleep patterns.'],
    };
  }

  const avgScore = data.reduce((sum, d) => sum + d.sleepScore, 0) / data.length;

  const bedTimeScores = data.map(d => ({ bedTime: d.bedTime, score: d.sleepScore }));
  bedTimeScores.sort((a, b) => b.score - a.score);
  const idealBedTime = bedTimeScores[0]?.bedTime ?? '22:30';

  const wakeTimeScores = data.map(d => ({ wakeTime: d.wakeTime, score: d.sleepScore }));
  wakeTimeScores.sort((a, b) => b.score - a.score);
  const idealWakeTime = wakeTimeScores[0]?.wakeTime ?? '06:30';

  let correlations: SleepOptimization['correlations'];
  let recommendations: string[];

  try {
    const sleepSummary = data.map(d => ({
      date: d.date,
      score: d.sleepScore,
      totalHours: d.totalHours,
      deepHours: d.deepSleepHours,
      remHours: d.remSleepHours,
      bedTime: d.bedTime,
      wakeTime: d.wakeTime,
      awakeMin: d.awakeMinutes,
    }));

    const aiResult = await generateJSON<{
      correlations: { factor: string; correlation: number; suggestion: string }[];
      recommendations: string[];
    }>(
      `Analyze this sleep data and identify correlations and recommendations.

Sleep history (last ${data.length} days):
${JSON.stringify(sleepSummary, null, 2)}

Average sleep score: ${Math.round(avgScore)}
Best bedtime: ${idealBedTime}
Best wake time: ${idealWakeTime}

Return a JSON object with:
- "correlations": array of { "factor": string, "correlation": number (-1 to 1), "suggestion": string } identifying what factors most affect sleep quality
- "recommendations": array of specific, actionable recommendation strings based on the patterns found`,
      {
        temperature: 0.4,
        system: 'You are a sleep science expert. Analyze sleep data and provide evidence-based recommendations. Be specific and actionable.',
      }
    );

    correlations = aiResult.correlations ?? [];
    recommendations = aiResult.recommendations ?? [];
  } catch {
    correlations = [
      { factor: 'Deep sleep duration', correlation: 0.85, suggestion: 'Aim for 1.5-2 hours of deep sleep for optimal recovery.' },
      { factor: 'Consistent bed time', correlation: 0.72, suggestion: 'Going to bed within 30 minutes of your ideal time improves sleep quality.' },
      { factor: 'Total sleep hours', correlation: 0.68, suggestion: 'Target 7-9 hours of total sleep per night.' },
    ];

    recommendations = [];
    if (avgScore < 70) {
      recommendations.push('Your average sleep score is below optimal. Consider establishing a consistent bedtime routine.');
    }
    if (avgScore >= 70 && avgScore < 85) {
      recommendations.push('Your sleep is good but could improve. Focus on reducing awake time during the night.');
    }
    if (avgScore >= 85) {
      recommendations.push('Excellent sleep quality! Maintain your current sleep habits.');
    }
    recommendations.push(`Your ideal bedtime appears to be around ${idealBedTime}.`);
  }

  return {
    userId,
    averageSleepScore: Math.round(avgScore),
    idealBedTime,
    idealWakeTime,
    correlations,
    recommendations,
  };
}

export async function getSleepScore(userId: string, date: string): Promise<number> {
  const targetDate = new Date(date);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const record = await prisma.healthMetric.findFirst({
    where: {
      entityId: userId,
      type: 'sleep',
      recordedAt: {
        gte: targetDate,
        lt: nextDay,
      },
    },
  });

  if (!record) return 0;

  const meta = (record.metadata as SleepMetadata) ?? {};
  return calculateSleepScore(record.value, meta);
}
