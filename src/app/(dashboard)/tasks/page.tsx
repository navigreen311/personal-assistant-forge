'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskStatus, Priority } from '@/shared/types';
import type { TaskView, TaskFilters, TaskSortOptions, DailyTop3 as DailyTop3Type, ProcrastinationAlert } from '@/modules/tasks/types';
import TaskListView from '@/modules/tasks/components/TaskListView';
import TaskKanbanView from '@/modules/tasks/components/TaskKanbanView';
import TaskTableView from '@/modules/tasks/components/TaskTableView';
import TaskDetailPanel from '@/modules/tasks/components/TaskDetailPanel';
import TaskCreateForm from '@/modules/tasks/components/TaskCreateForm';
import DailyTop3 from '@/modules/tasks/components/DailyTop3';
import ProcrastinationAlerts from '@/modules/tasks/components/ProcrastinationAlerts';

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<TaskView>('LIST');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [dailyTop3, setDailyTop3] = useState<DailyTop3Type | null>(null);
  const [alerts, setAlerts] = useState<ProcrastinationAlert[]>([]);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [sort, setSort] = useState<TaskSortOptions>({ field: 'priority', direction: 'asc' });
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      {/* Daily Top 3 */}
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

      {/* Procrastination alerts */}
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

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* View switcher */}
          {(['LIST', 'KANBAN', 'TABLE'] as TaskView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                view === v ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700 bg-white border border-gray-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-md w-48"
          />

          {/* Status filter */}
          <select
            value={Array.isArray(filters.status) ? '' : filters.status ?? ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as TaskStatus || undefined })}
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
            onChange={(e) => setFilters({ ...filters, priority: e.target.value as Priority || undefined })}
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

      {/* Main content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {view === 'LIST' && (
            <TaskListView
              tasks={tasks}
              onTaskClick={setSelectedTask}
              onStatusChange={handleStatusChange}
              onPriorityChange={handlePriorityChange}
              onBulkAction={handleBulkAction}
            />
          )}
          {view === 'KANBAN' && (
            <TaskKanbanView
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onTaskClick={setSelectedTask}
              onAddTask={() => setShowCreateForm(true)}
            />
          )}
          {view === 'TABLE' && (
            <TaskTableView
              tasks={tasks}
              onTaskUpdate={(taskId, updates) => handleTaskUpdate(taskId, updates)}
              onSort={setSort}
              currentSort={sort}
            />
          )}
        </>
      )}

      {/* Create form modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="w-full max-w-lg">
            <TaskCreateForm
              onParse={handleParseTask}
              onCreate={handleCreateTask}
              entityId={filters.entityId ?? ''}
              onClose={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}

      {/* Task detail panel */}
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
