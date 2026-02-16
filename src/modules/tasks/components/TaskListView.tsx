'use client';

import { useState, useCallback } from 'react';
import type { Task, Priority, TaskStatus } from '@/shared/types';

interface TaskListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onPriorityChange: (taskId: string, priority: Priority) => void;
  onBulkAction: (taskIds: string[], action: string, value: string) => void;
  onReorder?: (taskIds: string[]) => void;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  P0: 'bg-red-100 text-red-800 border-red-200',
  P1: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  P2: 'bg-blue-100 text-blue-800 border-blue-200',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  BLOCKED: 'bg-red-100 text-red-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const PRIORITY_ORDER: Priority[] = ['P0', 'P1', 'P2'];

export default function TaskListView({
  tasks,
  onTaskClick,
  onStatusChange,
  onPriorityChange,
  onBulkAction,
}: TaskListViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  }, [selectedIds.size, tasks]);

  const cyclePriority = (taskId: string, current: Priority) => {
    const idx = PRIORITY_ORDER.indexOf(current);
    const next = PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
    onPriorityChange(taskId, next);
  };

  const cycleStatus = (taskId: string, current: TaskStatus) => {
    const idx = STATUS_ORDER.indexOf(current);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    onStatusChange(taskId, next);
  };

  const isOverdue = (task: Task) =>
    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE' && task.status !== 'CANCELLED';

  const formatDate = (date?: Date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-lg font-medium">No tasks yet</p>
        <p className="text-sm">Create your first task to get started</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 mb-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-800">{selectedIds.size} selected</span>
          <button
            onClick={() => onBulkAction([...selectedIds], 'status', 'DONE')}
            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Mark Done
          </button>
          <button
            onClick={() => onBulkAction([...selectedIds], 'priority', 'P0')}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Set P0
          </button>
          <button
            onClick={() => onBulkAction([...selectedIds], 'status', 'CANCELLED')}
            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[40px_60px_1fr_100px_100px_120px_80px] gap-2 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
        <div>
          <input
            type="checkbox"
            checked={selectedIds.size === tasks.length}
            onChange={toggleSelectAll}
            className="rounded border-gray-300"
          />
        </div>
        <div>Priority</div>
        <div>Title</div>
        <div>Status</div>
        <div>Due Date</div>
        <div>Assignee</div>
        <div>Tags</div>
      </div>

      {/* Task rows */}
      <div className="divide-y divide-gray-100">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`grid grid-cols-[40px_60px_1fr_100px_100px_120px_80px] gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors ${
              draggedId === task.id ? 'opacity-50' : ''
            }`}
            draggable
            onDragStart={() => setDraggedId(task.id)}
            onDragEnd={() => setDraggedId(null)}
          >
            <div>
              <input
                type="checkbox"
                checked={selectedIds.has(task.id)}
                onChange={() => toggleSelect(task.id)}
                className="rounded border-gray-300"
              />
            </div>
            <div>
              <button
                onClick={() => cyclePriority(task.id, task.priority)}
                className={`px-2 py-0.5 text-xs font-semibold rounded border ${PRIORITY_COLORS[task.priority]}`}
              >
                {task.priority}
              </button>
            </div>
            <div>
              <button
                onClick={() => onTaskClick(task)}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 text-left truncate block w-full"
              >
                {task.title}
              </button>
            </div>
            <div>
              <button
                onClick={() => cycleStatus(task.id, task.status)}
                className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_COLORS[task.status]}`}
              >
                {task.status.replace('_', ' ')}
              </button>
            </div>
            <div className={`text-xs ${isOverdue(task) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              {formatDate(task.dueDate)}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {task.assigneeId ? (
                <span className="inline-flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium text-white">
                    {task.assigneeId.slice(0, 2).toUpperCase()}
                  </span>
                </span>
              ) : (
                '—'
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {task.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
