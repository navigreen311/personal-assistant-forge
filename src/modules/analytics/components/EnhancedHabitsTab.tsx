'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { HabitDefinition, HabitCorrelation } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedHabitsTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type HabitFrequency = 'DAILY' | 'WEEKDAYS' | 'X_PER_WEEK' | 'WEEKLY';
type LinkedTo = 'NONE' | 'GOAL' | 'WORKFLOW';

interface NewHabitFormData {
  name: string;
  frequency: HabitFrequency;
  timesPerWeek: number;
  reminderTime: string;
  linkedTo: LinkedTo;
}

interface HeatmapDay {
  date: string;
  count: number;
  dayOfWeek: number;
}

interface HeatmapWeek {
  days: HeatmapDay[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_FORM: NewHabitFormData = {
  name: '',
  frequency: 'DAILY',
  timesPerWeek: 3,
  reminderTime: '08:00',
  linkedTo: 'NONE',
};

const HEATMAP_WEEKS = 12;

const HEATMAP_COLORS = [
  'bg-gray-100',       // 0 completions
  'bg-green-200',      // 1 completion
  'bg-green-400',      // 2 completions
  'bg-green-600',      // 3+ completions
  'bg-green-800',      // 5+ completions
];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHeatmapColor(count: number): string {
  if (count === 0) return HEATMAP_COLORS[0];
  if (count === 1) return HEATMAP_COLORS[1];
  if (count === 2) return HEATMAP_COLORS[2];
  if (count <= 4) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

function formatFrequency(habit: HabitDefinition): string {
  switch (habit.frequency) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKDAY':
      return 'Weekdays';
    case 'WEEKLY':
      return 'Weekly';
    default:
      return habit.frequency;
  }
}

function getStreakUnit(frequency: HabitDefinition['frequency']): string {
  return frequency === 'WEEKLY' ? 'weeks' : 'days';
}

function getCompletionRateColor(rate: number): string {
  if (rate >= 80) return 'text-green-600';
  if (rate >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function isTodayApplicable(frequency: HabitDefinition['frequency']): boolean {
  if (frequency === 'DAILY') return true;
  if (frequency === 'WEEKDAY') {
    const day = new Date().getDay();
    return day >= 1 && day <= 5;
  }
  // WEEKLY habits are applicable any day
  return true;
}

function isTodayCompleted(habit: HabitDefinition): boolean {
  const todayStr = new Date().toISOString().split('T')[0];
  return habit.completionHistory.some(
    (h) => h.date === todayStr && h.completed,
  );
}

function buildHeatmapData(habits: HabitDefinition[]): HeatmapWeek[] {
  const today = new Date();
  const weeks: HeatmapWeek[] = [];

  const countByDate = new Map<string, number>();
  for (const habit of habits) {
    for (const entry of habit.completionHistory) {
      if (entry.completed) {
        const current = countByDate.get(entry.date) ?? 0;
        countByDate.set(entry.date, current + 1);
      }
    }
  }

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (HEATMAP_WEEKS * 7 - 1));
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const endDate = new Date(today);
  const currentDate = new Date(startDate);
  let currentWeek: HeatmapDay[] = [];

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    currentWeek.push({
      date: dateStr,
      count: countByDate.get(dateStr) ?? 0,
      dayOfWeek: currentDate.getDay(),
    });

    if (currentWeek.length === 7) {
      weeks.push({ days: currentWeek });
      currentWeek = [];
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (currentWeek.length > 0) {
    weeks.push({ days: currentWeek });
  }

  return weeks;
}

function getMonthLabels(weeks: HeatmapWeek[]): { label: string; colStart: number }[] {
  const labels: { label: string; colStart: number }[] = [];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  let lastMonth = -1;

  for (let w = 0; w < weeks.length; w++) {
    const firstDay = weeks[w].days[0];
    if (!firstDay) continue;
    const month = new Date(firstDay.date + 'T00:00:00').getMonth();
    if (month !== lastMonth) {
      labels.push({ label: months[month], colStart: w });
      lastMonth = month;
    }
  }

  return labels;
}
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedHabitsTab({ entityId, period }: EnhancedHabitsTabProps) {
  const [habits, setHabits] = useState<HabitDefinition[]>([]);
  const [correlations, setCorrelations] = useState<HabitCorrelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<NewHabitFormData>({ ...INITIAL_FORM });
  const [submitting, setSubmitting] = useState(false);

  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const [tooltipData, setTooltipData] = useState<{
    date: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // ---- Fetch habits -------------------------------------------------------

  const fetchHabits = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch(`/api/analytics/habits?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch habits: ${res.statusText}`);

      const body: {
        habits: HabitDefinition[];
        correlations?: HabitCorrelation[];
      } = await res.json();

      const sorted = [...(body.habits ?? [])].sort(
        (a, b) => b.streak - a.streak,
      );
      setHabits(sorted);
      setCorrelations(body.correlations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load habits');
    } finally {
      setLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  // ---- Toggle today completion -------------------------------------------

  const handleToggleToday = async (habit: HabitDefinition) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const wasCompleted = isTodayCompleted(habit);

    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habit.id) return h;
        const updatedHistory = wasCompleted
          ? h.completionHistory.filter((e) => e.date !== todayStr)
          : [...h.completionHistory, { date: todayStr, completed: true }];
        return {
          ...h,
          completionHistory: updatedHistory,
          streak: wasCompleted ? Math.max(0, h.streak - 1) : h.streak + 1,
        };
      }),
    );
    setTogglingIds((prev) => new Set(prev).add(habit.id));

    try {
      const res = await fetch(`/api/analytics/habits/${habit.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr, completed: !wasCompleted }),
      });
      if (!res.ok) throw new Error('Failed to update habit completion');
    } catch (err) {
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== habit.id) return h;
          const revertedHistory = wasCompleted
            ? [...h.completionHistory, { date: todayStr, completed: true }]
            : h.completionHistory.filter((e) => e.date !== todayStr);
          return {
            ...h,
            completionHistory: revertedHistory,
            streak: wasCompleted ? h.streak + 1 : Math.max(0, h.streak - 1),
          };
        }),
      );
      setError(err instanceof Error ? err.message : 'Failed to toggle completion');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(habit.id);
        return next;
      });
    }
  };

  // ---- Create habit ------------------------------------------------------

  const handleCreateHabit = async () => {
    if (!formData.name.trim()) return;
    setSubmitting(true);

    const payload = {
      name: formData.name.trim(),
      frequency:
        formData.frequency === 'X_PER_WEEK'
          ? `${formData.timesPerWeek}x/week`
          : formData.frequency,
      reminderTime: formData.reminderTime,
      linkedTo: formData.linkedTo === 'NONE' ? undefined : formData.linkedTo,
      entityId,
    };

    try {
      const res = await fetch('/api/analytics/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create habit');

      const created: HabitDefinition = await res.json();
      setHabits((prev) => [...prev, created].sort((a, b) => b.streak - a.streak));
      setShowModal(false);
      setFormData({ ...INITIAL_FORM });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create habit');
    } finally {
      setSubmitting(false);
    }
  };

  const openModal = () => {
    setFormData({ ...INITIAL_FORM });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ ...INITIAL_FORM });
  };

  const heatmapWeeks = useMemo(() => buildHeatmapData(habits), [habits]);
  const monthLabels = useMemo(() => getMonthLabels(heatmapWeeks), [heatmapWeeks]);

  // ---- Render ------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Habit Tracker</h2>
        <button
          onClick={openModal}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + New Habit
        </button>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline hover:text-red-900">
            Dismiss
          </button>
        </div>
      )}

      {/* ---- Loading Skeleton ---- */}
      {loading && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="bg-gray-50 px-4 py-3">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-t border-gray-100 px-4 py-3">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-12 animate-pulse rounded bg-gray-200" />
                <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-200 mb-4" />
            <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      )}

      {/* ---- Empty State ---- */}
      {!loading && habits.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="mx-auto mb-3 text-4xl">{'\u{1F4CB}'}</div>
          <div className="text-gray-400 text-lg font-medium">
            No habits tracked yet.
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Start building consistency by adding your first habit.
          </p>
          <button
            onClick={openModal}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + New Habit
          </button>
        </div>
      )}

      {/* ---- Habits Table ---- */}
      {!loading && habits.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Habit</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Frequency</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Current Streak</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Best Streak</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Completion Rate</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Today</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  isToggling={togglingIds.has(habit.id)}
                  onToggleToday={() => handleToggleToday(habit)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Calendar Heatmap ---- */}
      {!loading && habits.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Activity Heatmap
          </h3>
          <div className="relative">
            {/* Month labels */}
            <div className="flex mb-1 ml-8">
              {monthLabels.map((ml, idx) => (
                <span
                  key={idx}
                  className="text-xs text-gray-400"
                  style={{
                    position: 'relative',
                    left: `${ml.colStart * 16}px`,
                    marginRight:
                      idx < monthLabels.length - 1
                        ? `${((monthLabels[idx + 1]?.colStart ?? ml.colStart) - ml.colStart) * 16 - 30}px`
                        : '0',
                  }}
                >
                  {ml.label}
                </span>
              ))}
            </div>

            {/* Heatmap grid */}
            <div className="flex gap-[3px]">
              {/* Day labels */}
              <div className="flex flex-col gap-[3px] pr-1">
                <div className="h-[13px] text-[10px] text-gray-400" />
                <div className="h-[13px] text-[10px] text-gray-400 leading-[13px]">Mon</div>
                <div className="h-[13px] text-[10px] text-gray-400" />
                <div className="h-[13px] text-[10px] text-gray-400 leading-[13px]">Wed</div>
                <div className="h-[13px] text-[10px] text-gray-400" />
                <div className="h-[13px] text-[10px] text-gray-400 leading-[13px]">Fri</div>
                <div className="h-[13px] text-[10px] text-gray-400" />
              </div>

              {/* Week columns */}
              {heatmapWeeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-[3px]">
                  {week.days.map((day) => (
                    <div
                      key={day.date}
                      className={`h-[13px] w-[13px] rounded-sm ${getHeatmapColor(day.count)} cursor-pointer transition-colors`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltipData({
                          date: day.date,
                          count: day.count,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                        });
                      }}
                      onMouseLeave={() => setTooltipData(null)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
              <span>Less</span>
              {HEATMAP_COLORS.map((color, idx) => (
                <div key={idx} className={`h-[11px] w-[11px] rounded-sm ${color}`} />
              ))}
              <span>More</span>
            </div>

            {/* Tooltip */}
            {tooltipData && (
              <div
                className="fixed z-50 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg pointer-events-none"
                style={{
                  left: `${tooltipData.x}px`,
                  top: `${tooltipData.y}px`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <span className="font-medium">
                  {tooltipData.count} completion
                  {tooltipData.count !== 1 ? 's' : ''}
                </span>{' '}
                on{' '}
                {new Date(tooltipData.date + 'T00:00:00').toLocaleDateString(
                  'en-US',
                  { weekday: 'short', month: 'short', day: 'numeric' },
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Correlation Insights ---- */}
      {!loading && correlations.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
          <h3 className="mb-3 text-sm font-semibold text-blue-900 flex items-center gap-2">
            <svg
              className="h-5 w-5 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            Correlation Insights
          </h3>
          <div className="space-y-2">
            {correlations.map((corr, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-400">{'\u{1F4A1}'}</span>
                <p className="text-sm text-blue-800">{corr.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ---- New Habit Modal ---- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">New Habit</h3>
                <button
                  onClick={closeModal}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">Habit Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Morning review, Exercise, Read 30 min"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="frequency" value="DAILY" checked={formData.frequency === 'DAILY'}
                      onChange={() => setFormData((prev) => ({ ...prev, frequency: 'DAILY' }))} className="text-blue-600" />
                    Daily
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="frequency" value="WEEKDAYS" checked={formData.frequency === 'WEEKDAYS'}
                      onChange={() => setFormData((prev) => ({ ...prev, frequency: 'WEEKDAYS' }))} className="text-blue-600" />
                    Weekdays
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="frequency" value="X_PER_WEEK" checked={formData.frequency === 'X_PER_WEEK'}
                      onChange={() => setFormData((prev) => ({ ...prev, frequency: 'X_PER_WEEK' }))} className="text-blue-600" />
                    <span className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={7} value={formData.timesPerWeek}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          timesPerWeek: Math.max(1, Math.min(7, parseInt(e.target.value) || 1)),
                          frequency: 'X_PER_WEEK',
                        }))}
                        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      times per week
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="frequency" value="WEEKLY" checked={formData.frequency === 'WEEKLY'}
                      onChange={() => setFormData((prev) => ({ ...prev, frequency: 'WEEKLY' }))} className="text-blue-600" />
                    Weekly
                  </label>
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Time</label>
                <input
                  type="time" value={formData.reminderTime}
                  onChange={(e) => setFormData((prev) => ({ ...prev, reminderTime: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Linked To</label>
                <select
                  value={formData.linkedTo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, linkedTo: e.target.value as LinkedTo }))}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="NONE">None</option>
                  <option value="GOAL">Goal</option>
                  <option value="WORKFLOW">Workflow</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateHabit}
                  disabled={submitting || !formData.name.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Creating...' : 'Create Habit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HabitRowProps {
  habit: HabitDefinition;
  isToggling: boolean;
  onToggleToday: () => void;
}

function HabitRow({ habit, isToggling, onToggleToday }: HabitRowProps) {
  const applicable = isTodayApplicable(habit.frequency);
  const completed = isTodayCompleted(habit);

  return (
    <tr className="transition-colors hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">{habit.name}</td>

      <td className="px-4 py-3 text-gray-600 text-sm">
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {formatFrequency(habit)}
        </span>
      </td>

      <td className="px-4 py-3 text-sm">
        <span className="font-medium text-gray-900">
          {'\u{1F525}'} {habit.streak} {getStreakUnit(habit.frequency)}
        </span>
      </td>

      <td className="px-4 py-3 text-sm text-gray-600">
        {habit.longestStreak} {getStreakUnit(habit.frequency)}
      </td>

      <td className="px-4 py-3 text-sm">
        <span
          className={`font-semibold ${getCompletionRateColor(habit.successRate)}`}
        >
          {habit.successRate}%
        </span>
      </td>

      <td className="px-4 py-3 text-center">
        {applicable ? (
          <button
            onClick={onToggleToday}
            disabled={isToggling}
            className={`inline-flex h-6 w-6 items-center justify-center rounded border-2 transition-colors disabled:opacity-50 ${
              completed
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-gray-300 bg-white hover:border-blue-400'
            }`}
            aria-label={`Mark ${habit.name} as ${completed ? 'incomplete' : 'complete'} for today`}
          >
            {completed && (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ) : (
          <span className="text-gray-300">{'\u2014'}</span>
        )}
      </td>
    </tr>
  );
}
