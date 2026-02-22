'use client';

import { useState, useMemo } from 'react';
import type { MaintenanceTask, ServiceProvider } from '../types';
import AddTaskModal from './AddTaskModal';

// ─── Types ──────────────────────────────────────────────────────────────────
interface HouseholdTasksTabProps {
  tasks: MaintenanceTask[];
  providers?: ServiceProvider[];
  onAddTask?: (task: Partial<MaintenanceTask>) => void;
  onMarkDone?: (taskId: string) => void;
  onReschedule?: (taskId: string) => void;
  onRefresh?: () => void;
}

type StatusFilter = 'ALL' | 'UPCOMING' | 'OVERDUE' | 'COMPLETED';

// ─── Constants ──────────────────────────────────────────────────────────────
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'COMPLETED', label: 'Done' },
];

const CATEGORY_ICONS: Record<MaintenanceTask['category'], string> = {
  HVAC: '🌡',
  PLUMBING: '🔧',
  ELECTRICAL: '⚡',
  LAWN: '🌿',
  APPLIANCE: '🏠',
  ROOF: '🏗',
  PEST: '🐛',
  GENERAL: '🔨',
};

const FREQUENCY_LABELS: Record<MaintenanceTask['frequency'], string> = {
  ONE_TIME: 'One-time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  BIANNUAL: 'Biannual',
  ANNUAL: 'Annual',
};

const SEASONAL_TASKS: Record<string, string[]> = {
  'Spring (Mar-May)': ['AC inspection', 'Lawn fertilizing', 'Gutter cleaning', 'Exterior painting touch-up'],
  'Summer (Jun-Aug)': ['Pool maintenance', 'Irrigation check', 'Deck sealing', 'Pest inspection'],
  'Fall (Sep-Nov)': ['Furnace tune-up', 'Leaf removal', 'Weatherstripping', 'Chimney cleaning'],
  'Winter (Dec-Feb)': ['Pipe insulation check', 'Roof inspection', 'Snow equipment prep', 'Indoor air quality test'],
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function daysOverdue(dueDate: Date): number {
  const now = new Date();
  const due = new Date(dueDate);
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function daysUntilDue(dueDate: Date): number {
  const now = new Date();
  const due = new Date(dueDate);
  const diff = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatDate(date: Date | undefined): string {
  if (!date) return '---';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getProviderName(
  providerId: string | undefined,
  providers: ServiceProvider[]
): string {
  if (!providerId) return 'DIY';
  const p = providers.find((prov) => prov.id === providerId);
  return p?.name ?? 'Unknown';
}

// ─── Demo Data ──────────────────────────────────────────────────────────────
const DEMO_TASKS: MaintenanceTask[] = [
  {
    id: 't1',
    userId: 'u1',
    category: 'GENERAL',
    title: 'Clean gutters and downspouts',
    description: 'Remove debris from all gutters, check downspout drainage',
    frequency: 'BIANNUAL',
    season: 'FALL',
    lastCompletedDate: new Date('2025-10-15'),
    nextDueDate: new Date('2026-02-10'),
    assignedProviderId: 'p1',
    estimatedCostUsd: 150,
    status: 'OVERDUE',
    notes: 'Check for loose brackets too',
  },
  {
    id: 't2',
    userId: 'u1',
    category: 'HVAC',
    title: 'Replace HVAC air filter',
    description: 'Replace 20x25x1 filter in main unit',
    frequency: 'MONTHLY',
    season: 'ANY',
    lastCompletedDate: new Date('2026-02-01'),
    nextDueDate: new Date('2026-03-01'),
    estimatedCostUsd: 25,
    status: 'UPCOMING',
  },
  {
    id: 't3',
    userId: 'u1',
    category: 'LAWN',
    title: 'Weekly lawn mowing',
    description: 'Mow front and back yard, edge walkways',
    frequency: 'MONTHLY',
    season: 'SPRING',
    lastCompletedDate: new Date('2026-02-20'),
    nextDueDate: new Date('2026-02-27'),
    assignedProviderId: 'p2',
    estimatedCostUsd: 75,
    status: 'UPCOMING',
  },
  {
    id: 't4',
    userId: 'u1',
    category: 'PLUMBING',
    title: 'Water heater flush',
    description: 'Drain and flush sediment from water heater tank',
    frequency: 'ANNUAL',
    season: 'WINTER',
    lastCompletedDate: new Date('2025-01-20'),
    nextDueDate: new Date('2026-01-20'),
    assignedProviderId: 'p1',
    estimatedCostUsd: 120,
    status: 'OVERDUE',
  },
  {
    id: 't5',
    userId: 'u1',
    category: 'PEST',
    title: 'Quarterly pest treatment',
    description: 'Interior and exterior spray treatment',
    frequency: 'QUARTERLY',
    season: 'ANY',
    lastCompletedDate: new Date('2026-01-10'),
    nextDueDate: new Date('2026-04-10'),
    estimatedCostUsd: 95,
    status: 'UPCOMING',
  },
  {
    id: 't6',
    userId: 'u1',
    category: 'ELECTRICAL',
    title: 'Test smoke detectors and replace batteries',
    frequency: 'BIANNUAL',
    season: 'SPRING',
    lastCompletedDate: new Date('2025-09-15'),
    nextDueDate: new Date('2026-03-15'),
    estimatedCostUsd: 30,
    status: 'UPCOMING',
  },
  {
    id: 't7',
    userId: 'u1',
    category: 'APPLIANCE',
    title: 'Deep clean dishwasher',
    description: 'Run cleaning cycle, clean filter and spray arms',
    frequency: 'QUARTERLY',
    season: 'ANY',
    lastCompletedDate: new Date('2025-11-01'),
    nextDueDate: new Date('2026-02-01'),
    estimatedCostUsd: 0,
    status: 'COMPLETED',
  },
];

// ─── Task Card ──────────────────────────────────────────────────────────────
function TaskCard({
  task,
  providers,
  onMarkDone,
  onReschedule,
}: {
  task: MaintenanceTask;
  providers: ServiceProvider[];
  onMarkDone?: (taskId: string) => void;
  onReschedule?: (taskId: string) => void;
}) {
  const isOverdue = task.status === 'OVERDUE';
  const isCompleted = task.status === 'COMPLETED';
  const providerName = getProviderName(task.assignedProviderId, providers);

  return (
    <div
      className={`relative rounded-xl border p-4 transition-shadow hover:shadow-md ${
        isOverdue
          ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
          : isCompleted
            ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'
            : 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
      }`}
    >
      {/* Status indicator bar */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
          isOverdue
            ? 'bg-red-500'
            : isCompleted
              ? 'bg-gray-400'
              : 'bg-green-500'
        }`}
      />

      <div className="ml-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg" title={task.category}>
              {CATEGORY_ICONS[task.category]}
            </span>
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              {task.title}
            </h4>
          </div>
          {isOverdue && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              Overdue {daysOverdue(task.nextDueDate)} days
            </span>
          )}
          {!isOverdue && !isCompleted && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
              Due: {formatDate(task.nextDueDate)}
            </span>
          )}
          {isCompleted && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              Completed
            </span>
          )}
        </div>

        {/* Details */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{FREQUENCY_LABELS[task.frequency]}</span>
          <span>Provider: {providerName}</span>
          {task.estimatedCostUsd != null && task.estimatedCostUsd > 0 && (
            <span>~${task.estimatedCostUsd}</span>
          )}
          {task.season && task.season !== 'ANY' && (
            <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">
              {task.season}
            </span>
          )}
        </div>

        {/* Date details */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
          {task.lastCompletedDate && (
            <span>Last done: {formatDate(task.lastCompletedDate)}</span>
          )}
          {isOverdue && (
            <span className="text-red-500 dark:text-red-400">
              Was due: {formatDate(task.nextDueDate)}
            </span>
          )}
        </div>

        {/* Actions */}
        {!isCompleted && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {task.assignedProviderId && (
              <button className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                📞 Book via VoiceForge
              </button>
            )}
            <button
              onClick={() => onMarkDone?.(task.id)}
              className="inline-flex items-center gap-1 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
            >
              ✅ Mark Done
            </button>
            <button
              onClick={() => onReschedule?.(task.id)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              📅 Reschedule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function HouseholdTasksTab({
  tasks: propTasks,
  providers = [],
  onAddTask,
  onMarkDone,
  onReschedule,
  onRefresh,
}: HouseholdTasksTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [localTasks, setLocalTasks] = useState<MaintenanceTask[]>(
    propTasks.length > 0 ? propTasks : DEMO_TASKS
  );

  // Derive filtered tasks
  const allTasks = localTasks;

  const overdueTasks = useMemo(
    () => allTasks.filter((t) => t.status === 'OVERDUE'),
    [allTasks]
  );
  const upcomingTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.status === 'UPCOMING')
        .sort(
          (a, b) =>
            new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
        ),
    [allTasks]
  );
  const completedTasks = useMemo(
    () => allTasks.filter((t) => t.status === 'COMPLETED' || t.status === 'SKIPPED'),
    [allTasks]
  );

  // Apply status filter
  const filteredOverdue = statusFilter === 'ALL' || statusFilter === 'OVERDUE' ? overdueTasks : [];
  const filteredUpcoming = statusFilter === 'ALL' || statusFilter === 'UPCOMING' ? upcomingTasks : [];
  const filteredCompleted = statusFilter === 'ALL' || statusFilter === 'COMPLETED' ? completedTasks : [];

  const totalTasks = allTasks.length;
  const isEmpty = totalTasks === 0;

  function handleAddTask(task: Partial<MaintenanceTask>) {
    const newTask: MaintenanceTask = {
      id: `t-${Date.now()}`,
      userId: 'u1',
      category: task.category ?? 'GENERAL',
      title: task.title ?? 'Untitled Task',
      description: task.description,
      frequency: task.frequency ?? 'ONE_TIME',
      season: task.season,
      nextDueDate: task.nextDueDate ?? new Date(),
      assignedProviderId: task.assignedProviderId,
      estimatedCostUsd: task.estimatedCostUsd,
      status: task.status ?? 'UPCOMING',
      notes: task.notes,
    };
    setLocalTasks((prev) => [...prev, newTask]);
    onAddTask?.(task);
  }

  function handleMarkDone(taskId: string) {
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: 'COMPLETED' as const, lastCompletedDate: new Date() }
          : t
      )
    );
    onMarkDone?.(taskId);
  }

  function handleReschedule(taskId: string) {
    // For demo: push due date forward by 7 days
    setLocalTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const newDate = new Date(t.nextDueDate);
        newDate.setDate(newDate.getDate() + 7);
        return { ...t, nextDueDate: newDate, status: 'UPCOMING' as const };
      })
    );
    onReschedule?.(taskId);
  }

  // ── Empty State ───────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Maintenance Tasks
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add Task
          </button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 py-16 px-6 text-center">
          <div className="text-4xl mb-4">🔧</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No maintenance tasks
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
            Add your first task to start tracking home maintenance. AI can generate a
            seasonal schedule based on your property details.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add Your First Task
          </button>
        </div>

        <AddTaskModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddTask}
          providers={providers.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Maintenance Tasks
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add Task
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Status Filter */}
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === f.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f.label}
              {f.value === 'OVERDUE' && overdueTasks.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {overdueTasks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 ml-auto">
          <span>{overdueTasks.length} overdue</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>{upcomingTasks.length} upcoming</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>{completedTasks.length} completed</span>
        </div>
      </div>

      {/* ── OVERDUE Section ────────────────────────────────────────────────── */}
      {filteredOverdue.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
              Overdue ({filteredOverdue.length})
            </h3>
          </div>
          <div className="space-y-3">
            {filteredOverdue.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                providers={providers}
                onMarkDone={handleMarkDone}
                onReschedule={handleReschedule}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── UPCOMING Section ───────────────────────────────────────────────── */}
      {filteredUpcoming.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
              Upcoming ({filteredUpcoming.length})
            </h3>
          </div>
          <div className="space-y-3">
            {filteredUpcoming.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                providers={providers}
                onMarkDone={handleMarkDone}
                onReschedule={handleReschedule}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── COMPLETED Section (collapsible) ────────────────────────────────── */}
      {filteredCompleted.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 mb-3 group"
          >
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
              Completed ({filteredCompleted.length})
            </h3>
          </button>
          {showCompleted && (
            <div className="space-y-3">
              {filteredCompleted.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  providers={providers}
                  onMarkDone={handleMarkDone}
                  onReschedule={handleReschedule}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No results for active filter */}
      {filteredOverdue.length === 0 &&
        filteredUpcoming.length === 0 &&
        filteredCompleted.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 py-12 px-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No tasks match the current filter.
            </p>
          </div>
        )}

      {/* ── Seasonal Preview ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Seasonal Preview
          </h3>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">
            ✨ AI: Generate seasonal schedule
          </button>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {Object.entries(SEASONAL_TASKS).map(([season, tasks]) => (
            <div key={season} className="px-5 py-3 flex items-start gap-3">
              <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 w-32 pt-0.5">
                {season}
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {tasks.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Add Task Modal ─────────────────────────────────────────────────── */}
      <AddTaskModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddTask}
        providers={providers.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
