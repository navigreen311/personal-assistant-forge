'use client';

import { useState, useMemo } from 'react';
import type { MaintenanceTask } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const categoryColors: Record<string, string> = {
  HVAC: 'bg-blue-200 text-blue-800',
  PLUMBING: 'bg-cyan-200 text-cyan-800',
  ELECTRICAL: 'bg-yellow-200 text-yellow-800',
  LAWN: 'bg-green-200 text-green-800',
  APPLIANCE: 'bg-purple-200 text-purple-800',
  ROOF: 'bg-orange-200 text-orange-800',
  PEST: 'bg-red-200 text-red-800',
  GENERAL: 'bg-gray-200 text-gray-800',
};

type CalendarView = 'month' | 'week' | 'list';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusDotColor(task: MaintenanceTask, today: Date): string {
  if (task.status === 'COMPLETED') return 'bg-gray-400';
  if (task.status === 'OVERDUE') return 'bg-red-500';

  const dueDate = new Date(task.nextDueDate);
  const todayStr = today.toDateString();
  const dueStr = dueDate.toDateString();

  if (dueStr === todayStr) return 'bg-blue-500';
  if (dueDate > today) return 'bg-green-500';
  return 'bg-red-500';
}

function formatMonthYear(month: number, year: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function getMonthLabel(month: number): string {
  return new Date(2026, month, 1).toLocaleDateString('en-US', { month: 'short' });
}

function getWeekDates(baseDate: Date): Date[] {
  const dayOfWeek = baseDate.getDay();
  const start = new Date(baseDate);
  start.setDate(start.getDate() - dayOfWeek);
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MaintenanceCalendarProps {
  tasks: MaintenanceTask[];
  onAddTask?: () => void;
}

export default function MaintenanceCalendar({ tasks, onAddTask }: MaintenanceCalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [view, setView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // -- Navigation -----------------------------------------------------------

  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }

  // -- Computed data --------------------------------------------------------

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const days = useMemo(
    () =>
      Array.from({ length: totalCells }, (_, i) => {
        const dayNum = i - firstDayOfWeek + 1;
        return dayNum > 0 && dayNum <= daysInMonth ? dayNum : null;
      }),
    [totalCells, firstDayOfWeek, daysInMonth],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, MaintenanceTask[]>();
    for (const task of tasks) {
      const dueDate = new Date(task.nextDueDate);
      const key = `${dueDate.getFullYear()}-${dueDate.getMonth()}-${dueDate.getDate()}`;
      const existing = map.get(key) ?? [];
      existing.push(task);
      map.set(key, existing);
    }
    return map;
  }, [tasks]);

  function getTasksForDate(date: Date): MaintenanceTask[] {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return tasksByDay.get(key) ?? [];
  }

  function getTasksForDay(day: number): MaintenanceTask[] {
    const key = `${currentYear}-${currentMonth}-${day}`;
    return tasksByDay.get(key) ?? [];
  }

  // -- Sorted tasks for list view -------------------------------------------

  const monthTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        const d = new Date(t.nextDueDate);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  }, [tasks, currentMonth, currentYear]);

  // -- Week view dates ------------------------------------------------------

  const weekDates = useMemo(() => {
    const base = selectedDate ?? today;
    return getWeekDates(base);
  }, [selectedDate, today]);

  // -- Selected day tasks ---------------------------------------------------

  const selectedDayTasks = useMemo(() => {
    if (!selectedDate) return [];
    return getTasksForDate(selectedDate);
  }, [selectedDate, tasksByDay]);

  // -- Prev / Next month labels ---------------------------------------------

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;

  // -- Handle task quick actions --------------------------------------------

  function handleMarkDone(taskId: string) {
    // Placeholder — would call API to update task status
    console.log('Mark done:', taskId);
  }

  function handleReschedule(taskId: string) {
    // Placeholder — would open reschedule modal
    console.log('Reschedule:', taskId);
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-4">
      {/* ── Calendar Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <span aria-hidden="true">&lsaquo;</span> {getMonthLabel(prevMonth)}
          </button>

          <h3 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center">
            {formatMonthYear(currentMonth, currentYear)}
          </h3>

          <button
            onClick={goToNextMonth}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {getMonthLabel(nextMonth)} <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>

        {/* View toggles + Add task */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['month', 'week', 'list'] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === v
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {onAddTask && (
            <button
              onClick={onAddTask}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Add Task
            </button>
          )}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> Due Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Overdue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" /> Completed
        </span>
      </div>

      {/* ── Month View ───────────────────────────────────────────────────── */}
      {view === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {WEEK_DAYS.map((d) => (
            <div key={d} className="text-xs font-medium text-gray-500 dark:text-gray-400 text-center py-1">
              {d}
            </div>
          ))}
          {days.map((day, idx) => {
            const isToday =
              day === today.getDate() &&
              currentMonth === today.getMonth() &&
              currentYear === today.getFullYear();
            const isSelected =
              selectedDate &&
              day === selectedDate.getDate() &&
              currentMonth === selectedDate.getMonth() &&
              currentYear === selectedDate.getFullYear();
            const dayTasks = day ? getTasksForDay(day) : [];

            return (
              <div
                key={idx}
                onClick={() => {
                  if (day) {
                    setSelectedDate(new Date(currentYear, currentMonth, day));
                  }
                }}
                className={`min-h-[70px] border rounded-lg p-1.5 transition-colors ${
                  day ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500' : ''
                } ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                    : isToday
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                      : day
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30'
                }`}
              >
                {day && (
                  <>
                    <div
                      className={`text-xs font-medium ${
                        isToday
                          ? 'text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {day}
                    </div>
                    {dayTasks.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {dayTasks.slice(0, 3).map((task) => (
                          <div key={task.id} className="flex items-center gap-1">
                            <span
                              className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${getStatusDotColor(task, today)}`}
                            />
                            <span
                              className={`text-[10px] px-1 rounded truncate ${categoryColors[task.category] ?? 'bg-gray-100'}`}
                              title={task.title}
                            >
                              {task.title}
                            </span>
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 pl-3">
                            +{dayTasks.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Week View ────────────────────────────────────────────────────── */}
      {view === 'week' && (
        <div className="space-y-1">
          {/* Week header */}
          <div className="grid grid-cols-7 gap-1">
            {weekDates.map((date, idx) => {
              const isToday = date.toDateString() === today.toDateString();
              const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
              return (
                <div
                  key={idx}
                  className={`text-center py-1 text-xs font-medium rounded-t-lg ${
                    isToday
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {WEEK_DAYS[idx]} {date.getDate()}
                </div>
              );
            })}
          </div>

          {/* Week cells */}
          <div className="grid grid-cols-7 gap-1">
            {weekDates.map((date, idx) => {
              const isToday = date.toDateString() === today.toDateString();
              const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
              const dayTasks = getTasksForDate(date);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(new Date(date))}
                  className={`min-h-[120px] border rounded-lg p-2 cursor-pointer transition-colors hover:border-blue-400 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : isToday
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {dayTasks.length > 0 ? (
                    <div className="space-y-1">
                      {dayTasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-1">
                          <span
                            className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${getStatusDotColor(task, today)}`}
                          />
                          <span
                            className={`text-[11px] px-1 rounded truncate ${categoryColors[task.category] ?? 'bg-gray-100'}`}
                            title={task.title}
                          >
                            {task.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
                      No tasks
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── List View ────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="space-y-2">
          {monthTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No tasks scheduled for {formatMonthYear(currentMonth, currentYear)}.
            </div>
          ) : (
            monthTasks.map((task) => {
              const dueDate = new Date(task.nextDueDate);
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedDate(dueDate)}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full flex-shrink-0 ${getStatusDotColor(task, today)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {task.title}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${categoryColors[task.category] ?? 'bg-gray-100'}`}
                      >
                        {task.category}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {dueDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      task.status === 'OVERDUE'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : task.status === 'COMPLETED'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : task.status === 'UPCOMING'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {task.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Day Detail Panel ─────────────────────────────────────────────── */}
      {selectedDate && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </h4>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close day detail"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {selectedDayTasks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No tasks scheduled for this day.
            </p>
          ) : (
            <div className="space-y-3">
              {selectedDayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-gray-700 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-block h-3 w-3 rounded-full flex-shrink-0 ${getStatusDotColor(task, today)}`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {task.category} &middot; {task.frequency}
                        {task.estimatedCostUsd != null && (
                          <> &middot; ~${task.estimatedCostUsd}</>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkDone(task.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-green-50 dark:bg-green-900/20 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                    >
                      Done
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReschedule(task.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-50 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
