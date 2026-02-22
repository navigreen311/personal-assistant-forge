'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FitnessTabProps {
  entityId?: string;
  period?: string;
}

interface WorkoutEntry {
  id: string;
  type: string;
  duration: number;
  calories: number;
  date: string;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Demo data                                                          */
/* ------------------------------------------------------------------ */

const DEMO_STATS = [
  { label: 'Steps Today', value: '8,432', target: '10,000', pct: 84, icon: '👟' },
  { label: 'Calories Burned', value: '1,847', target: '2,200', pct: 84, icon: '🔥' },
  { label: 'Active Minutes', value: '45', target: '60', pct: 75, icon: '⏱️' },
  { label: 'Distance', value: '3.8 mi', target: '5.0 mi', pct: 76, icon: '📍' },
];

const DEMO_WORKOUTS: WorkoutEntry[] = [
  { id: '1', type: 'Running', duration: 32, calories: 380, date: '2026-02-21', notes: 'Morning jog' },
  { id: '2', type: 'Strength', duration: 45, calories: 290, date: '2026-02-20', notes: 'Upper body' },
  { id: '3', type: 'Cycling', duration: 60, calories: 520, date: '2026-02-19' },
  { id: '4', type: 'Yoga', duration: 30, calories: 120, date: '2026-02-18', notes: 'Flexibility focus' },
];

const WORKOUT_TYPES = ['Running', 'Cycling', 'Strength', 'Yoga', 'Swimming', 'Walking', 'HIIT', 'Other'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FitnessTab({ period }: FitnessTabProps) {
  const [showLogForm, setShowLogForm] = useState(false);
  const [workoutType, setWorkoutType] = useState('Running');
  const [workoutDuration, setWorkoutDuration] = useState('30');
  const [workoutCalories, setWorkoutCalories] = useState('');
  const [workoutNotes, setWorkoutNotes] = useState('');
  const [workouts] = useState<WorkoutEntry[]>(DEMO_WORKOUTS);

  const handleLogWorkout = () => {
    setShowLogForm(false);
    setWorkoutType('Running');
    setWorkoutDuration('30');
    setWorkoutCalories('');
    setWorkoutNotes('');
  };

  const weeklyTotal = workouts.reduce((sum, w) => sum + w.duration, 0);
  const weeklyCalories = workouts.reduce((sum, w) => sum + w.calories, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Fitness Tracker
        </h3>
        <button
          onClick={() => setShowLogForm(!showLogForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          {showLogForm ? 'Cancel' : '+ Log Workout'}
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-300">
        Connect a fitness tracker or log workouts manually to see your activity data.
        Showing demo data for the selected period ({period ?? '7d'}).
      </div>

      {/* Today&apos;s Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DEMO_STATS.map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {stat.icon} {stat.label}
              </span>
              <span className="text-xs text-gray-400">
                Target: {stat.target}
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {stat.value}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 rounded-full h-2 transition-all"
                style={{ width: `${Math.min(stat.pct, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1 text-right">{stat.pct}%</div>
          </div>
        ))}
      </div>

      {/* Weekly Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Weekly Workouts</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{workouts.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Minutes</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{weeklyTotal}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Calories Burned</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{weeklyCalories.toLocaleString()}</p>
        </div>
      </div>

      {/* Log Workout Form */}
      {showLogForm && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Log Workout</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {WORKOUT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (min)</label>
              <input
                type="number"
                value={workoutDuration}
                onChange={(e) => setWorkoutDuration(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Calories (optional)</label>
              <input
                type="number"
                value={workoutCalories}
                onChange={(e) => setWorkoutCalories(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder="Auto-estimated if blank"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={workoutNotes}
                onChange={(e) => setWorkoutNotes(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder="e.g. Morning run"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleLogWorkout}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
            >
              Save Workout
            </button>
          </div>
        </div>
      )}

      {/* Workout History */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white">Recent Workouts</h4>
        </div>
        {workouts.length === 0 ? (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            No workout history yet. Log your first workout above!
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {workouts.map((w) => (
              <div key={w.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {w.type === 'Running' ? '🏃' : w.type === 'Cycling' ? '🚴' : w.type === 'Strength' ? '💪' : w.type === 'Yoga' ? '🧘' : w.type === 'Swimming' ? '🏊' : '🏋️'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{w.type}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {w.date}{w.notes ? ` · ${w.notes}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                  <span>{w.duration} min</span>
                  <span>{w.calories} cal</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Showing demo data. Connect a wearable to see real-time fitness metrics.
      </p>
    </div>
  );
}
