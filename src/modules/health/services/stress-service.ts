import { generateJSON } from '@/lib/ai';
import type { StressLevel, StressAdjustment } from '../types';

const stressStore = new Map<string, StressLevel[]>();

export async function recordStressLevel(
  userId: string,
  level: number,
  source: string,
  triggers?: string[]
): Promise<StressLevel> {
  const entry: StressLevel = {
    userId,
    timestamp: new Date(),
    level: Math.max(0, Math.min(100, level)),
    source,
    triggers: triggers ?? [],
  };

  const existing = stressStore.get(userId) ?? [];
  existing.unshift(entry);
  stressStore.set(userId, existing);

  return entry;
}

export async function getStressHistory(userId: string, days: number): Promise<StressLevel[]> {
  const all = stressStore.get(userId) ?? [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return all.filter(s => new Date(s.timestamp) >= cutoff);
}

export async function suggestScheduleAdjustments(userId: string): Promise<StressAdjustment[]> {
  const recent = await getStressHistory(userId, 1);
  if (recent.length === 0) return [];

  const latestStress = recent[0].level;
  if (latestStress <= 70) return [];

  // Use AI to generate personalized schedule adjustments
  try {
    const triggers = recent[0].triggers;
    const adjustments = await generateJSON<StressAdjustment[]>(
      `A user's stress level is ${latestStress}/100 (${latestStress > 90 ? 'critical' : latestStress > 80 ? 'high' : 'elevated'}).
${triggers.length > 0 ? `Known stress triggers: ${triggers.join(', ')}` : 'No specific triggers identified.'}
Source: ${recent[0].source}

Suggest specific schedule adjustments to reduce stress. Return a JSON array of objects, each with:
- "suggestion": specific actionable suggestion string
- "adjustmentType": one of "RESCHEDULE", "CANCEL", "DELEGATE", "BREAK", "LIGHTEN"
- "reason": brief explanation of why this helps
- "targetEventId": null (optional, for future calendar integration)

Provide ${latestStress > 90 ? '3-5' : latestStress > 80 ? '2-4' : '1-3'} suggestions appropriate to the stress severity.`,
      {
        temperature: 0.5,
        system: 'You are a stress management and productivity expert. Provide specific, actionable schedule adjustments proportional to stress severity. Be empathetic but practical.',
      }
    );

    return adjustments;
  } catch {
    // Fallback to rule-based adjustments
    const adjustments: StressAdjustment[] = [];

    if (latestStress > 90) {
      adjustments.push({
        suggestion: 'Cancel non-essential meetings for the next 24 hours',
        adjustmentType: 'CANCEL',
        reason: 'Stress level is critically high. Reducing commitments will help recovery.',
      });
      adjustments.push({
        suggestion: 'Insert 15-minute breaks between remaining commitments',
        adjustmentType: 'BREAK',
        reason: 'Scheduled breathing room reduces accumulated stress.',
      });
    }

    if (latestStress > 80) {
      adjustments.push({
        suggestion: 'Reschedule low-priority meetings to next week',
        adjustmentType: 'RESCHEDULE',
        reason: 'Reducing meeting load during high-stress periods improves focus.',
      });
      adjustments.push({
        suggestion: 'Delegate routine tasks to team members',
        adjustmentType: 'DELEGATE',
        reason: 'Offloading tasks reduces cognitive load during high-stress periods.',
      });
    }

    if (latestStress > 70) {
      adjustments.push({
        suggestion: 'Lighten workload by postponing non-urgent deliverables',
        adjustmentType: 'LIGHTEN',
        reason: 'Managing workload prevents stress from escalating further.',
      });
    }

    return adjustments;
  }
}

export async function getStressTrend(
  userId: string,
  days: number
): Promise<{ date: string; average: number }[]> {
  const history = await getStressHistory(userId, days);
  const dailyMap = new Map<string, number[]>();

  for (const entry of history) {
    const dateKey = new Date(entry.timestamp).toISOString().split('T')[0];
    const existing = dailyMap.get(dateKey) ?? [];
    existing.push(entry.level);
    dailyMap.set(dateKey, existing);
  }

  return Array.from(dailyMap.entries()).map(([date, levels]) => ({
    date,
    average: Math.round(levels.reduce((a, b) => a + b, 0) / levels.length),
  })).sort((a, b) => a.date.localeCompare(b.date));
}
