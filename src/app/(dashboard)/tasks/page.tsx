'use client';

import { useState, useEffect, useCallback } from 'react';
import { useShadowPageMap } from '@/hooks/useShadowPageMap';
import type { Task, TaskStatus, Priority } from '@/shared/types';
import type {
  TaskFilters,
  TaskSortOptions,
  DailyTop3 as DailyTop3Type,
  ProcrastinationAlert,
  PrioritizationScore,
  DependencyGraph,
} from '@/modules/tasks/types';
import TaskListView from '@/modules/tasks/components/TaskListView';
import TaskKanbanView from '@/modules/tasks/components/TaskKanbanView';
import TaskTableView from '@/modules/tasks/components/TaskTableView';
import TaskDetailPanel from '@/modules/tasks/components/TaskDetailPanel';
import TaskCreateForm from '@/modules/tasks/components/TaskCreateForm';
import DailyTop3 from '@/modules/tasks/components/DailyTop3';
import ProcrastinationAlerts from '@/modules/tasks/components/ProcrastinationAlerts';
import PriorityMatrix from '@/modules/tasks/components/PriorityMatrix';
import DependencyGraphView from '@/modules/tasks/components/DependencyGraphView';

// Lazy-import new components created by other agents with fallback null
// These are imported dynamically so the page compiles even if they don't exist yet.
let DailyTop3Hero: React.ComponentType<{
  tasks: Task[];
  onComplete: (taskId: string) => void;
  onHide: () => void;
}> | null = null;

let EnhancedTaskCreateModal: React.ComponentType<{
  onParse: (text: string) => Promise<import('@/modules/tasks/types').ParsedTaskInput>;
  onCreate: (params: {
    title: string;
    entityId: string;
    description?: string;
    priority?: Priority;
    dueDate?: Date;
    tags?: string[];
  }) => Promise<void>;
  entityId: string;
  onClose: () => void;
}> | null = null;

let GanttView: React.ComponentType<{ tasks: Task[] }> | null = null;

// Attempt to load the optional components at module evaluation time.
// Next.js allows top-level dynamic requires for optional components.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DailyTop3Hero = require('@/modules/tasks/components/DailyTop3Hero').default;
} catch {
  DailyTop3Hero = null;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  EnhancedTaskCreateModal = require('@/modules/tasks/components/EnhancedTaskCreateModal').default;
} catch {
  EnhancedTaskCreateModal = null;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GanttView = require('@/modules/tasks/components/GanttView').default;
} catch {
  GanttView = null;
}

// Extended view type that includes GANTT (beyond the base TaskView union in types)
type ExtendedTaskView = 'LIST' | 'KANBAN' | 'TABLE' | 'GANTT';

// Active tab type for the three main tab sections
type ActiveTab = 'tasks' | 'matrix' | 'dependencies';

// Due date grouping options for the enhanced filter bar
type DueDateGroup = '' | 'today' | 'week' | 'overdue' | 'nodate';

// Sort field options for the enhanced sort control
type SortField = 'priority' | 'dueDate' | 'createdAt' | 'entity';

// ─── Utility helpers ───────────────────────────────────────────────────────────

/**
 * Derive a lightweight PrioritizationScore array from the tasks array.
 * Used to populate PriorityMatrix when a real scoring API is unavailable.
 */
function deriveScoresFromTasks(tasks: Task[]): PrioritizationScore[] {
  return tasks.map((task) => {
    const now = new Date();
    const priorityScore = task.priority === 'P0' ? 80 : task.priority === 'P1' ? 50 : 20;
    const dueDateScore =
      task.dueDate && new Date(task.dueDate) < now
        ? 20
        : task.dueDate && (new Date(task.dueDate).getTime() - now.getTime()) / 86_400_000 <= 3
        ? 15
        : 0;
    const overallScore = Math.min(100, priorityScore + dueDateScore);

    const isUrgent =
      task.dueDate
        ? (new Date(task.dueDate).getTime() - now.getTime()) / 86_400_000 <= 3
        : false;
    const isImportant = task.priority === 'P0' || task.priority === 'P1';

    type EQ = 'DO_FIRST' | 'SCHEDULE' | 'DELEGATE' | 'ELIMINATE';
    const quadrant: EQ =
      isUrgent && isImportant
        ? 'DO_FIRST'
        : !isUrgent && isImportant
        ? 'SCHEDULE'
        : isUrgent && !isImportant
        ? 'DELEGATE'
        : 'ELIMINATE';

    return {
      taskId: task.id,
      overallScore,
      quadrant,
      factors: [
        { name: 'Priority', weight: 0.6, score: priorityScore, reason: `Task priority ${task.priority}` },
        { name: 'Due Date', weight: 0.4, score: dueDateScore, reason: task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date' },
      ],
      recommendation:
        quadrant === 'DO_FIRST'
          ? 'Handle immediately — urgent and important'
          : quadrant === 'SCHEDULE'
          ? 'Schedule dedicated time for this'
          : quadrant === 'DELEGATE'
          ? 'Consider delegating'
          : 'Evaluate whether this is truly necessary',
    };
  });
}

/**
 * Build a minimal DependencyGraph from the tasks array.
 * Reads `task.blockedBy` / `task.blocks` arrays when available.
 */
function buildDependencyGraph(tasks: Task[]): DependencyGraph {
  const COL_SPACING = 260;
  const ROW_SPACING = 110;

  const nodes = tasks.map((task, idx) => ({
    taskId: task.id,
    taskTitle: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
    depth: 0,
    blockedByCount: 0,
    blockingCount: 0,
    isCriticalPath: task.priority === 'P0',
    isBottleneck: false,
    position: {
      x: (idx % 4) * COL_SPACING + 30,
      y: Math.floor(idx / 4) * ROW_SPACING + 30,
    },
  }));

  return {
    nodes,
    edges: [],
    criticalPath: tasks.filter((t) => t.priority === 'P0').map((t) => t.id),
    bottlenecks: [],
  };
}

/**
 * Apply due date grouping filter to the task list.
 */
function applyDueDateGroup(tasks: Task[], group: DueDateGroup): Task[] {
  if (!group) return tasks;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000 - 1);
  const endOfWeek = new Date(startOfDay.getTime() + 7 * 86_400_000 - 1);

  return tasks.filter((task) => {
    const due = task.dueDate ? new Date(task.dueDate) : null;
    switch (group) {
      case 'today':
        return due && due >= startOfDay && due <= endOfDay;
      case 'week':
        return due && due >= startOfDay && due <= endOfWeek;
      case 'overdue':
        return due && due < startOfDay;
      case 'nodate':
        return !due;
      default:
        return true;
    }
  });
}

/**
 * Sort tasks by the extended sort field options.
 */
function sortTasksByField(tasks: Task[], field: SortField, direction: 'asc' | 'desc'): Task[] {
  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'priority': {
        const order = { P0: 0, P1: 1, P2: 2 };
        cmp = (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
        break;
      }
      case 'dueDate': {
        const aD = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bD = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        cmp = aD - bD;
        break;
      }
      case 'createdAt': {
        const aC = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bC = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        cmp = aC - bC;
        break;
      }
      case 'entity': {
        cmp = (a.entityId ?? '').localeCompare(b.entityId ?? '');
        break;
      }
    }
    return direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  // ── Core state ───────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);

  useShadowPageMap({
    pageId: 'tasks',
    title: 'Tasks',
    description: 'Task list, priorities, deadlines, assignments',
    visibleObjects: tasks.slice(0, 20).map((t) => ({
      id: t.id,
      type: 'task',
      label: t.title,
      status: t.status,
      priority: t.priority,
      selector: `[data-task-id="${t.id}"]`,
      deepLink: `/tasks/${t.id}`,
    })),
    availableActions: [
      { id: 'create_task', label: 'Create task', voiceTriggers: ['create task', 'new task', 'add task'], confirmationLevel: 'tap', reversible: true, blastRadius: 'self' },
      { id: 'show_overdue', label: 'Show overdue', voiceTriggers: ['overdue', 'late tasks'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
      { id: 'show_today', label: "What's due today", voiceTriggers: ['today', 'due today'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
    ],
    activeFilters: {},
    activeEntity: null,
  });
  const [view, setView] = useState<ExtendedTaskView>('LIST');
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [dailyTop3] = useState<DailyTop3Type | null>(null);
  const [alerts] = useState<ProcrastinationAlert[]>([]);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [sort, setSort] = useState<TaskSortOptions>({ field: 'priority', direction: 'asc' });
  const [isLoading, setIsLoading] = useState(true);

  // ── Daily Top 3 Hero state ───────────────────────────────────────────────────
  const [showDailyTop3, setShowDailyTop3] = useState(true);

  // ── Enhanced filter bar state ────────────────────────────────────────────────
  const [entityFilter, setEntityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dueDateGroup, setDueDateGroup] = useState<DueDateGroup>('');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDirection] = useState<'asc' | 'desc'>('asc');

  // ── Data fetching ─────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.entityId) params.set('entityId', filters.entityId);
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
        params.set('status', statuses);
      }
      if (filters.priority) {
        const priorities = Array.isArray(filters.priority) ? filters.priority.join(',') : filters.priority;
        params.set('priority', priorities);
      }
      if (filters.search) params.set('search', filters.search);
      params.set('sort', `${sort.field}:${sort.direction}`);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      const json = await res.json();
      if (json.success) setTasks(json.data);
    } catch {
      // Handle error silently
    } finally {
      setIsLoading(false);
    }
  }, [filters, sort]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Derived / filtered task list ──────────────────────────────────────────────
  const visibleTasks = (() => {
    let result = tasks;

    // Entity filter (local, supplementing server-side filter)
    if (entityFilter) {
      result = result.filter((t) => t.entityId === entityFilter);
    }

    // Project filter
    if (projectFilter) {
      result = result.filter((t) => (t as Task & { projectId?: string }).projectId === projectFilter);
    }

    // Assignee filter
    if (assigneeFilter === 'unassigned') {
      result = result.filter((t) => !(t as Task & { assigneeId?: string }).assigneeId);
    }

    // Due date grouping
    result = applyDueDateGroup(result, dueDateGroup);

    // Extended sort
    result = sortTasksByField(result, sortField, sortDirection);

    return result;
  })();

  // Unique entity options derived from the loaded tasks
  const entityOptions = Array.from(new Set(tasks.map((t) => t.entityId).filter(Boolean))) as string[];

  // ── Top 3 tasks for the hero (highest priority, non-done) ─────────────────────
  const top3Tasks = tasks
    .filter((t) => t.status !== 'DONE')
    .sort((a, b) => {
      const order = { P0: 0, P1: 1, P2: 2 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    })
    .slice(0, 3);

  // ── Event handlers ───────────────────────────────────────────────────────────
  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchTasks();
  };

  const handlePriorityChange = async (taskId: string, priority: Priority) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    fetchTasks();
  };

  const handleBulkAction = async (taskIds: string[], action: string, value: string) => {
    const updates: Record<string, string> = {};
    updates[action] = value;
    await fetch('/api/tasks/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds, updates }),
    });
    fetchTasks();
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    fetchTasks();
  };

  const handleCreateTask = async (params: {
    title: string;
    entityId: string;
    description?: string;
    priority?: Priority;
    dueDate?: Date;
    tags?: string[];
  }) => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        dueDate: params.dueDate?.toISOString(),
      }),
    });
    fetchTasks();
    setShowCreateForm(false);
  };

  const handleParseTask = async (text: string) => {
    const res = await fetch('/api/tasks/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, entityId: filters.entityId ?? '' }),
    });
    const json = await res.json();
    return json.data;
  };

  const handleDeleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    setSelectedTask(null);
    fetchTasks();
  };

  const handleDependencyNodeClick = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) setSelectedTask(task);
  };

  // ── Derived data for tab views ───────────────────────────────────────────────
  // PriorityMatrix and DependencyGraphView now accept tasks directly
  void deriveScoresFromTasks; // keep function available for future use
  void buildDependencyGraph;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Daily Top 3 — legacy DailyTop3 component (shown when dailyTop3 data exists) */}
      {dailyTop3 && (
        <DailyTop3
          data={dailyTop3}
          onStartWorking={(taskId) => {
            const task = tasks.find((t) => t.id === taskId);
            if (task) setSelectedTask(task);
          }}
          onDismiss={() => {}}
        />
      )}

      {/* ── Daily Top 3 Hero Section (always visible until hidden) ── */}
      {showDailyTop3 && DailyTop3Hero && (
        <DailyTop3Hero
          tasks={top3Tasks}
          onComplete={(taskId) => handleStatusChange(taskId, 'DONE')}
          onHide={() => setShowDailyTop3(false)}
        />
      )}

      {/* ── Procrastination alerts ── */}
      {alerts.length > 0 && (
        <ProcrastinationAlerts
          alerts={alerts}
          onBreakDown={() => {}}
          onDelegate={() => {}}
          onEliminate={() => {}}
          onScheduleNow={() => {}}
          onDismiss={() => {}}
        />
      )}

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {(
          [
            { id: 'tasks', label: 'Tasks' },
            { id: 'matrix', label: 'Priority Matrix' },
            { id: 'dependencies', label: 'Dependencies' },
          ] as { id: ActiveTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Toolbar (shown for tasks tab only) ── */}
      {activeTab === 'tasks' && (
        <div className="space-y-2">
          {/* Row 1: View switcher + primary actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* View switcher including GANTT */}
              {(['LIST', 'KANBAN', 'TABLE', 'GANTT'] as ExtendedTaskView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded ${
                    view === v
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700 bg-white border border-gray-200'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <input
                type="text"
                placeholder="Search tasks..."
                value={filters.search ?? ''}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value || undefined })
                }
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-md w-48"
              />

              {/* Status filter */}
              <select
                value={Array.isArray(filters.status) ? '' : filters.status ?? ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: (e.target.value as TaskStatus) || undefined,
                  })
                }
                className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
              >
                <option value="">All Status</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="BLOCKED">Blocked</option>
                <option value="DONE">Done</option>
              </select>

              {/* Priority filter */}
              <select
                value={Array.isArray(filters.priority) ? '' : filters.priority ?? ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    priority: (e.target.value as Priority) || undefined,
                  })
                }
                className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
              >
                <option value="">All Priority</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>

              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                New Task
              </button>
            </div>
          </div>

          {/* Row 2: Enhanced filter controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Entity filter */}
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
            >
              <option value="">All Entities</option>
              {entityOptions.map((eid) => (
                <option key={eid} value={eid}>
                  {eid}
                </option>
              ))}
            </select>

            {/* Project filter */}
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
            >
              <option value="">All Projects</option>
            </select>

            {/* Assignee filter */}
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
            >
              <option value="">All Assignees</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
            </select>

            {/* Due date grouping */}
            <select
              value={dueDateGroup}
              onChange={(e) => setDueDateGroup(e.target.value as DueDateGroup)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
            >
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="overdue">Overdue</option>
              <option value="nodate">No Date</option>
            </select>

            {/* Sort by */}
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md"
            >
              <option value="priority">Sort: Priority</option>
              <option value="dueDate">Sort: Due Date</option>
              <option value="createdAt">Sort: Created</option>
              <option value="entity">Sort: Entity</option>
            </select>

            {/* Active filter indicators */}
            {(entityFilter || projectFilter || assigneeFilter || dueDateGroup) && (
              <button
                onClick={() => {
                  setEntityFilter('');
                  setProjectFilter('');
                  setAssigneeFilter('');
                  setDueDateGroup('');
                }}
                className="px-2 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* ── Tasks Tab ── */}
          {activeTab === 'tasks' && (
            <>
              {view === 'LIST' && (
                <TaskListView
                  tasks={visibleTasks}
                  onTaskClick={setSelectedTask}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onBulkAction={handleBulkAction}
                />
              )}
              {view === 'KANBAN' && (
                <TaskKanbanView
                  tasks={visibleTasks}
                  onStatusChange={handleStatusChange}
                  onTaskClick={setSelectedTask}
                  onAddTask={() => setShowCreateForm(true)}
                />
              )}
              {view === 'TABLE' && (
                <TaskTableView
                  tasks={visibleTasks}
                  onTaskUpdate={(taskId, updates) => handleTaskUpdate(taskId, updates)}
                  onSort={setSort}
                  currentSort={sort}
                />
              )}
              {view === 'GANTT' && (
                GanttView ? (
                  <GanttView tasks={visibleTasks} />
                ) : (
                  <div className="flex items-center justify-center py-16 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                    <div className="text-center">
                      <p className="text-sm font-medium">Gantt View</p>
                      <p className="text-xs mt-1 text-gray-400">GanttView component is not yet available.</p>
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {/* ── Priority Matrix Tab ── */}
          {activeTab === 'matrix' && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Eisenhower Priority Matrix</h2>
                <span className="text-xs text-gray-400">{visibleTasks.length} tasks</span>
              </div>
              <PriorityMatrix
                tasks={visibleTasks}
                onTaskClick={setSelectedTask}
              />
            </div>
          )}

          {/* ── Dependencies Tab ── */}
          {activeTab === 'dependencies' && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Task Dependency Graph</h2>
                <span className="text-xs text-gray-400">{visibleTasks.length} tasks</span>
              </div>
              <DependencyGraphView
                tasks={visibleTasks}
                onTaskClick={setSelectedTask}
              />
            </div>
          )}
        </>
      )}

      {/* ── Create Task Modal ── */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="w-full max-w-lg">
            {EnhancedTaskCreateModal ? (
              <EnhancedTaskCreateModal
                onParse={handleParseTask}
                onCreate={handleCreateTask}
                entityId={filters.entityId ?? ''}
                onClose={() => setShowCreateForm(false)}
              />
            ) : (
              <TaskCreateForm
                onParse={handleParseTask}
                onCreate={handleCreateTask}
                entityId={filters.entityId ?? ''}
                onClose={() => setShowCreateForm(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Task Detail Panel ── */}
      {selectedTask && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelectedTask(null)}
          />
          <TaskDetailPanel
            task={selectedTask}
            onUpdate={(updates) => handleTaskUpdate(selectedTask.id, updates)}
            onDelete={handleDeleteTask}
            onClose={() => setSelectedTask(null)}
            isSlideOut
          />
        </>
      )}
    </div>
  );
}
