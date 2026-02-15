'use client';

import HabitTracker from '@/modules/analytics/components/HabitTracker';
import HabitCorrelationChart from '@/modules/analytics/components/HabitCorrelationChart';
import type { HabitDefinition, HabitCorrelation } from '@/modules/analytics/types';

const demoHabits: HabitDefinition[] = [
  {
    id: '1', userId: 'demo', name: 'Morning Exercise', frequency: 'DAILY',
    streak: 5, longestStreak: 14, successRate: 72,
    completionHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      return { date: d.toISOString().split('T')[0], completed: Math.random() > 0.3 };
    }),
    correlations: [
      { habitName: 'Morning Exercise', metric: 'productivity_score', correlationCoefficient: 0.42, description: 'Morning exercise correlates with 12% higher productivity' },
    ],
  },
  {
    id: '2', userId: 'demo', name: 'Daily Planning', frequency: 'WEEKDAY',
    streak: 3, longestStreak: 22, successRate: 85,
    completionHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      return { date: d.toISOString().split('T')[0], completed: Math.random() > 0.15 };
    }),
    correlations: [
      { habitName: 'Daily Planning', metric: 'focus_time', correlationCoefficient: 0.65, description: 'Daily planning correlates with 25% more focus time achieved' },
    ],
  },
  {
    id: '3', userId: 'demo', name: 'Weekly Review', frequency: 'WEEKLY',
    streak: 2, longestStreak: 8, successRate: 60,
    completionHistory: Array.from({ length: 8 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (7 * (7 - i)));
      return { date: d.toISOString().split('T')[0], completed: Math.random() > 0.4 };
    }),
    correlations: [],
  },
];

const allCorrelations: HabitCorrelation[] = demoHabits.flatMap((h) => h.correlations);

export default function HabitsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Habit Tracker</h2>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Add Habit
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demoHabits.map((habit) => (
          <HabitTracker key={habit.id} habit={habit} />
        ))}
      </div>

      <HabitCorrelationChart correlations={allCorrelations} />
    </div>
  );
}
