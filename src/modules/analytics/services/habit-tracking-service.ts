import { v4 as uuidv4 } from 'uuid';
import type { HabitDefinition, HabitCorrelation } from '../types';
import { calculateProductivityScore } from './productivity-scoring';

// In-memory store for habits
const habitStore = new Map<string, HabitDefinition>();

export async function createHabit(
  userId: string,
  name: string,
  frequency: string
): Promise<HabitDefinition> {
  const id = uuidv4();
  const habit: HabitDefinition = {
    id,
    userId,
    name,
    frequency: frequency as HabitDefinition['frequency'],
    streak: 0,
    longestStreak: 0,
    successRate: 0,
    completionHistory: [],
    correlations: [],
  };

  habitStore.set(id, habit);
  return habit;
}

export async function recordCompletion(
  habitId: string,
  date: string,
  completed: boolean
): Promise<HabitDefinition> {
  const habit = habitStore.get(habitId);
  if (!habit) throw new Error(`Habit not found: ${habitId}`);

  // Check if entry already exists for this date
  const existingIndex = habit.completionHistory.findIndex(
    (h) => h.date === date
  );
  if (existingIndex >= 0) {
    habit.completionHistory[existingIndex].completed = completed;
  } else {
    habit.completionHistory.push({ date, completed });
    // Sort by date
    habit.completionHistory.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  // Update streak
  habit.streak = calculateStreak(habit.completionHistory);
  if (habit.streak > habit.longestStreak) {
    habit.longestStreak = habit.streak;
  }

  // Update success rate (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentHistory = habit.completionHistory.filter(
    (h) => new Date(h.date) >= thirtyDaysAgo
  );
  const completedCount = recentHistory.filter((h) => h.completed).length;
  habit.successRate =
    recentHistory.length > 0
      ? Math.round((completedCount / recentHistory.length) * 100)
      : 0;

  habitStore.set(habitId, habit);
  return habit;
}

export async function getHabits(userId: string): Promise<HabitDefinition[]> {
  return Array.from(habitStore.values()).filter((h) => h.userId === userId);
}

export async function calculateCorrelations(
  habitId: string
): Promise<HabitCorrelation[]> {
  const habit = habitStore.get(habitId);
  if (!habit) throw new Error(`Habit not found: ${habitId}`);

  if (habit.completionHistory.length < 5) {
    return []; // Need at least 5 data points
  }

  const correlations: HabitCorrelation[] = [];

  // Get productivity scores for the same dates
  const habitDates = habit.completionHistory.map((h) => h.date);
  const productivityScores: number[] = [];
  const habitValues: number[] = [];

  for (const date of habitDates) {
    try {
      const score = await calculateProductivityScore(habit.userId, date);
      productivityScores.push(score.overallScore);
      const entry = habit.completionHistory.find((h) => h.date === date);
      habitValues.push(entry?.completed ? 1 : 0);
    } catch {
      // Skip dates where we can't calculate productivity
    }
  }

  if (productivityScores.length >= 5) {
    const coefficient = pearsonCorrelation(habitValues, productivityScores);
    const direction = coefficient > 0 ? 'higher' : 'lower';
    const impact = Math.abs(Math.round(coefficient * 100));

    correlations.push({
      habitName: habit.name,
      metric: 'productivity_score',
      correlationCoefficient: Math.round(coefficient * 1000) / 1000,
      description: `${habit.name} correlates with ${impact}% ${direction} productivity`,
    });
  }

  habit.correlations = correlations;
  habitStore.set(habitId, habit);
  return correlations;
}

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

// Exported for testing
export function _getHabitStore(): Map<string, HabitDefinition> {
  return habitStore;
}
