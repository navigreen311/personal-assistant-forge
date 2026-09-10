import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { HabitEntry } from '@prisma/client';
import type { HabitDefinition, HabitCorrelation } from '../types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import { calculateProductivityScore } from './productivity-scoring';

// --- Prisma-backed habit CRUD (replaces in-memory Map) ---
//
// P-13: `HabitEntry.entityId` is a REQUIRED foreign key to `Entity`. Every
// function below used to be handed a *userId* and put it in that column
// (`createHabit` wrote `entityId: userId`; `getHabits` filtered
// `where: { entityId: userId }`). Two consequences, both real:
//
//   1. Against a real Postgres the insert violates the FK, so habits could not
//      be created at all -- invisible to a suite that mocks Prisma.
//   2. The id in that column was caller-supplied and never proven, so the
//      lookups were not a tenancy check even where they happened to match.
//
// Habits are entity-scoped. Every entry point now takes a VerifiedEntityId and
// puts it in the WHERE clause, so a foreign row is simply not found.

export async function createHabit(
  entityId: VerifiedEntityId,
  name: string,
  frequency: string
): Promise<HabitDefinition> {
  const entry = await prisma.habitEntry.create({
    data: {
      entityId,
      name,
      frequency: frequency.toLowerCase(),
      targetPerPeriod: 1,
      streak: 0,
      longestStreak: 0,
      completedDates: [],
      isActive: true,
    },
  });

  return toHabitDefinition(entry);
}

export async function recordCompletion(
  habitId: string,
  entityId: VerifiedEntityId,
  date: string,
  completed: boolean
): Promise<HabitDefinition> {
  // Scope in the WHERE clause, not a check afterwards: another tenant's habit
  // is simply not found.
  const entry = await prisma.habitEntry.findFirst({ where: { id: habitId, entityId } });
  if (!entry) throw new Error(`Habit not found: ${habitId}`);

  const completedDates = (entry.completedDates as string[]) ?? [];

  // Build completion history from stored dates + new entry
  let history = completedDates.map((d: string) => ({ date: d, completed: true }));

  if (completed) {
    // Add date if not already present
    if (!completedDates.includes(date)) {
      history.push({ date, completed: true });
    }
  } else {
    // Remove date if present (uncompleting)
    history = history.filter((h) => h.date !== date);
  }

  // Sort by date
  history.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const newCompletedDates = history.map((h) => h.date);

  // Calculate streak from completion history
  const streak = calculateStreak(history);
  const longestStreak = Math.max(streak, entry.longestStreak);

  // `update` takes a unique WHERE and cannot carry the entity, so scope the
  // write with updateMany and re-read through the scoped finder.
  await prisma.habitEntry.updateMany({
    where: { id: habitId, entityId },
    data: {
      completedDates: newCompletedDates,
      streak,
      longestStreak,
    },
  });

  const updated = await prisma.habitEntry.findFirst({ where: { id: habitId, entityId } });
  if (!updated) throw new Error(`Habit not found: ${habitId}`);

  return toHabitDefinition(updated);
}

export async function getHabits(
  entityId: VerifiedEntityId,
  includeInactive?: boolean
): Promise<HabitDefinition[]> {
  const where: Record<string, unknown> = { entityId };
  if (!includeInactive) {
    where.isActive = true;
  }

  const entries = await prisma.habitEntry.findMany({ where });
  return entries.map(toHabitDefinition);
}

export async function getHabit(
  habitId: string,
  entityId: VerifiedEntityId
): Promise<HabitDefinition | null> {
  const entry = await prisma.habitEntry.findFirst({ where: { id: habitId, entityId } });
  return entry ? toHabitDefinition(entry) : null;
}

export async function getStreaks(entityId: VerifiedEntityId): Promise<
  {
    id: string;
    name: string;
    streak: number;
    longestStreak: number;
    completionRate: number;
  }[]
> {
  const entries = await prisma.habitEntry.findMany({
    where: { entityId, isActive: true },
  });

  return entries.map((entry: HabitEntry) => {
    const completedDates = (entry.completedDates as string[]) ?? [];
    const createdAt = entry.createdAt;
    const now = new Date();
    const daysSinceCreation = Math.max(
      1,
      Math.ceil((now.getTime() - createdAt.getTime()) / 86400000)
    );

    // Expected completions based on frequency
    let expectedCompletions: number;
    const freq = entry.frequency.toLowerCase();
    if (freq === 'daily') {
      expectedCompletions = daysSinceCreation * entry.targetPerPeriod;
    } else if (freq === 'weekdays') {
      const weeks = daysSinceCreation / 7;
      expectedCompletions = Math.ceil(weeks * 5) * entry.targetPerPeriod;
    } else if (freq === 'weekly') {
      expectedCompletions = Math.ceil(daysSinceCreation / 7) * entry.targetPerPeriod;
    } else {
      expectedCompletions = daysSinceCreation * entry.targetPerPeriod;
    }

    const completionRate =
      expectedCompletions > 0
        ? Math.min(100, Math.round((completedDates.length / expectedCompletions) * 100))
        : 100;

    return {
      id: entry.id,
      name: entry.name,
      streak: entry.streak,
      longestStreak: entry.longestStreak,
      completionRate,
    };
  });
}

export async function deleteHabit(
  habitId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  await prisma.habitEntry.updateMany({
    where: { id: habitId, entityId },
    data: { isActive: false },
  });
}

export async function updateHabit(
  habitId: string,
  entityId: VerifiedEntityId,
  updates: {
    name?: string;
    description?: string;
    frequency?: string;
    targetPerPeriod?: number;
  }
): Promise<HabitDefinition> {
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.frequency !== undefined) data.frequency = updates.frequency.toLowerCase();
  if (updates.targetPerPeriod !== undefined) data.targetPerPeriod = updates.targetPerPeriod;

  const count = await prisma.habitEntry.updateMany({
    where: { id: habitId, entityId },
    data,
  });
  if (count.count === 0) throw new Error(`Habit not found: ${habitId}`);

  const updated = await prisma.habitEntry.findFirst({ where: { id: habitId, entityId } });
  if (!updated) throw new Error(`Habit not found: ${habitId}`);

  return toHabitDefinition(updated);
}

// --- Correlation analysis (AI-powered) ---

export async function calculateCorrelations(
  habitId: string,
  entityId: VerifiedEntityId
): Promise<HabitCorrelation[]> {
  const entry = await prisma.habitEntry.findFirst({ where: { id: habitId, entityId } });
  if (!entry) throw new Error(`Habit not found: ${habitId}`);

  const completedDates = (entry.completedDates as string[]) ?? [];
  if (completedDates.length < 5) {
    return []; // Need at least 5 data points
  }

  const correlations: HabitCorrelation[] = [];
  const productivityScores: number[] = [];
  const habitValues: number[] = [];

  // `calculateProductivityScore` takes a USER id (it fans out over that user's
  // entities). This used to pass `entry.entityId`, which matched no user and so
  // scored against an empty entity set. Resolve the entity's owner instead.
  const owner = await prisma.entity.findUnique({
    where: { id: entry.entityId },
    select: { userId: true },
  });
  if (!owner) return [];

  for (const date of completedDates) {
    try {
      const score = await calculateProductivityScore(owner.userId, date);
      productivityScores.push(score.overallScore);
      habitValues.push(1);
    } catch {
      // Skip dates where we can't calculate productivity
    }
  }

  if (productivityScores.length >= 5) {
    const coefficient = pearsonCorrelation(habitValues, productivityScores);
    const direction = coefficient > 0 ? 'higher' : 'lower';
    const impact = Math.abs(Math.round(coefficient * 100));

    let description = `${entry.name} correlates with ${impact}% ${direction} productivity`;
    try {
      description = await generateText(
        `You are a habit coach. The habit "${entry.name}" (${entry.frequency}) has a Pearson correlation of ${coefficient.toFixed(3)} with productivity scores. The correlation is ${direction} at ${impact}% strength. Current streak: ${entry.streak} days. Provide a one-sentence insight about this correlation and its practical implications.`,
        { temperature: 0.7, maxTokens: 128 }
      );
    } catch {
      // Keep default description
    }

    correlations.push({
      habitName: entry.name,
      metric: 'productivity_score',
      correlationCoefficient: Math.round(coefficient * 1000) / 1000,
      description,
    });
  }

  return correlations;
}

// --- Streak calculation ---

export function calculateStreak(
  completionHistory: { date: string; completed: boolean }[]
): number {
  if (completionHistory.length === 0) return 0;

  // Sort descending by date
  const sorted = [...completionHistory].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let streak = 0;
  for (const entry of sorted) {
    if (entry.completed) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// --- Pearson correlation ---

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

// --- Helper: convert Prisma HabitEntry to HabitDefinition ---

function toHabitDefinition(entry: {
  id: string;
  entityId: string;
  name: string;
  frequency: string;
  streak: number;
  longestStreak: number;
  completedDates: unknown;
  isActive: boolean;
}): HabitDefinition {
  const completedDates = (entry.completedDates as string[]) ?? [];

  // Calculate success rate (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentDates = completedDates.filter(
    (d) => new Date(d) >= thirtyDaysAgo
  );
  const successRate =
    completedDates.length > 0
      ? Math.round((recentDates.length / 30) * 100)
      : 0;

  const completionHistory = completedDates.map((d: string) => ({
    date: d,
    completed: true,
  }));

  const rawFreq = entry.frequency.toUpperCase();
  const freq: HabitDefinition['frequency'] =
    rawFreq === 'WEEKDAYS' ? 'WEEKDAY' : (rawFreq as HabitDefinition['frequency']);

  return {
    id: entry.id,
    userId: entry.entityId,
    name: entry.name,
    frequency: freq,
    streak: entry.streak,
    longestStreak: entry.longestStreak,
    successRate,
    completionHistory,
    correlations: [],
  };
}
