import { subDays, format } from 'date-fns';
import { generateJSON } from '@/lib/ai';
import type { SleepData, SleepOptimization } from '../types';

const sleepStore = new Map<string, SleepData[]>();

export async function getSleepHistory(userId: string, days: number): Promise<SleepData[]> {
  const allData = sleepStore.get(userId) ?? [];

  if (allData.length === 0) {
    // Generate simulated data if none exists
    const generated = generateSimulatedSleepData(days);
    sleepStore.set(userId, generated);
    return generated;
  }

  return allData.slice(0, days);
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

  // Find bed times with highest sleep scores
  const bedTimeScores = data.map(d => ({ bedTime: d.bedTime, score: d.sleepScore }));
  bedTimeScores.sort((a, b) => b.score - a.score);
  const idealBedTime = bedTimeScores[0]?.bedTime ?? '22:30';

  const wakeTimeScores = data.map(d => ({ wakeTime: d.wakeTime, score: d.sleepScore }));
  wakeTimeScores.sort((a, b) => b.score - a.score);
  const idealWakeTime = wakeTimeScores[0]?.wakeTime ?? '06:30';

  // Use AI to generate personalized correlations and recommendations
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
    // Fallback to static analysis
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
  const data = await getSleepHistory(userId, 30);
  const entry = data.find(d => d.date === date);
  return entry?.sleepScore ?? 0;
}

function generateSimulatedSleepData(days: number): SleepData[] {
  const data: SleepData[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = subDays(now, i);
    const totalHours = 6 + Math.random() * 3;
    const deepPct = 0.15 + Math.random() * 0.1;
    const remPct = 0.2 + Math.random() * 0.1;
    const lightPct = 1 - deepPct - remPct;

    data.push({
      date: format(date, 'yyyy-MM-dd'),
      totalHours: Math.round(totalHours * 10) / 10,
      deepSleepHours: Math.round(totalHours * deepPct * 10) / 10,
      remSleepHours: Math.round(totalHours * remPct * 10) / 10,
      lightSleepHours: Math.round(totalHours * lightPct * 10) / 10,
      awakeMinutes: Math.floor(Math.random() * 30) + 5,
      sleepScore: Math.floor(60 + Math.random() * 40),
      bedTime: `${22 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      wakeTime: `${6 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
    });
  }

  return data;
}
