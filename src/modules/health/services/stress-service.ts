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
