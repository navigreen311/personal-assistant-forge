import type { TimeSavedEntry, TimeSavedSummary } from './types';
import { v4 as uuidv4 } from 'uuid';

// In-memory store
const timeSavedEntries: TimeSavedEntry[] = [];

export async function recordTimeSaved(
  userId: string,
  action: string,
  minutesSaved: number,
  category: string
): Promise<TimeSavedEntry> {
  const entry: TimeSavedEntry = {
    id: uuidv4(),
    userId,
    action,
    minutesSaved,
    category,
    timestamp: new Date(),
  };
  timeSavedEntries.push(entry);
  return entry;
}

export async function getTimeSavedSummary(userId: string, days = 30): Promise<TimeSavedSummary> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const entries = timeSavedEntries.filter(
    e => e.userId === userId && e.timestamp >= cutoff
  );

  const totalMinutesSaved = entries.reduce((sum, e) => sum + e.minutesSaved, 0);
  const totalHoursSaved = Math.round((totalMinutesSaved / 60) * 100) / 100;

  // By category
  const byCategory: Record<string, number> = {};
  for (const entry of entries) {
    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.minutesSaved;
  }

  // By day
  const byDayMap = new Map<string, number>();
  for (const entry of entries) {
    const dateStr = entry.timestamp.toISOString().slice(0, 10);
    byDayMap.set(dateStr, (byDayMap.get(dateStr) ?? 0) + entry.minutesSaved);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const streak = await calculateStreak(userId);

  // Project monthly savings from daily average
  const activeDays = byDay.length || 1;
  const avgPerDay = totalMinutesSaved / activeDays;
  const projectedMonthlySavings = Math.round(avgPerDay * 30);

  return {
    userId,
    totalMinutesSaved,
    totalHoursSaved,
    byCategory,
    byDay,
    streak,
    projectedMonthlySavings,
  };
}

export async function getRunningTotal(userId: string): Promise<{
  totalMinutes: number;
  totalHours: number;
  formattedDisplay: string;
}> {
  const entries = timeSavedEntries.filter(e => e.userId === userId);
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutesSaved, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  let formattedDisplay: string;
  if (totalHours === 0 && remainingMinutes === 0) {
    formattedDisplay = '0m saved';
  } else if (totalHours === 0) {
    formattedDisplay = `${remainingMinutes}m saved`;
  } else {
    formattedDisplay = `${totalHours}h ${remainingMinutes}m saved`;
  }

  return { totalMinutes, totalHours, formattedDisplay };
}

export async function calculateStreak(userId: string): Promise<number> {
  const entries = timeSavedEntries.filter(e => e.userId === userId);
  if (entries.length === 0) return 0;

  // Get unique dates with entries, sorted descending
  const uniqueDates = [...new Set(
    entries.map(e => e.timestamp.toISOString().slice(0, 10))
  )].sort((a, b) => b.localeCompare(a));

  if (uniqueDates.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Streak must include today or yesterday
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const current = new Date(uniqueDates[i - 1]);
    const previous = new Date(uniqueDates[i]);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// For testing: reset the in-memory store
export function _resetTimeSavedStore(): void {
  timeSavedEntries.length = 0;
}

// For testing: direct access to entries
export function _getTimeSavedEntries(): TimeSavedEntry[] {
  return timeSavedEntries;
}
