'use client';

import type { HabitDefinition } from '../types';

interface Props {
  habit: HabitDefinition;
}

export default function HabitTracker({ habit }: Props) {
  // Show last 30 days as a calendar heatmap
  const last30Days: { date: string; completed: boolean | null }[] = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const entry = habit.completionHistory.find((h) => h.date === dateStr);
    last30Days.push({
      date: dateStr,
      completed: entry?.completed ?? null,
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">{habit.name}</h4>
        <span className="text-sm text-gray-500">{habit.frequency}</span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{habit.streak}</p>
          <p className="text-xs text-gray-400">Current Streak</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">
            {habit.longestStreak}
          </p>
          <p className="text-xs text-gray-400">Longest</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600">
            {habit.successRate}%
          </p>
          <p className="text-xs text-gray-400">Success Rate</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase text-gray-400">
          Last 30 Days
        </p>
        <div className="flex flex-wrap gap-1">
          {last30Days.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.completed === null ? 'No data' : day.completed ? 'Completed' : 'Missed'}`}
              className={`h-4 w-4 rounded-sm ${
                day.completed === true
                  ? 'bg-green-500'
                  : day.completed === false
                    ? 'bg-red-300'
                    : 'bg-gray-100'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
