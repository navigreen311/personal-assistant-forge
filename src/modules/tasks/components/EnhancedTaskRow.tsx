'use client';

import type { Task, TaskStatus, Priority } from '@/shared/types';

interface EnhancedTaskRowProps {
  task: Task;
  onSelect: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onStart: (taskId: string) => void;
  onDelegate: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
}

function getPriorityBadgeClass(priority: Priority): string {
  switch (priority) {
    case 'P0':
      return 'bg-red-100 text-red-700';
    case 'P1':
      return 'bg-amber-100 text-amber-700';
    case 'P2':
      return 'bg-blue-100 text-blue-700';
  }
}

function getRowBackground(task: Task): string {
  if (task.status === 'DONE' || task.status === 'CANCELLED') return '';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (!task.dueDate) return '';

  const due = new Date(task.dueDate);

  if (due < todayStart) return 'bg-red-50/50';
  if (due >= todayStart && due <= todayEnd) return 'bg-amber-50/50';
  return '';
}

function formatDueDate(dueDate: Date | undefined): string {
  if (!dueDate) return '';

  const due = new Date(dueDate);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (due < todayStart) {
    return `Overdue: ${due.toLocaleDateString()}`;
  }
  if (due >= todayStart && due <= todayEnd) {
    return `Today ${due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return due.toLocaleDateString();
}

export default function EnhancedTaskRow({
  task,
  onSelect,
  onStatusChange,
  onStart,
  onDelegate,
  onSnooze,
}: EnhancedTaskRowProps) {
  const isDone = task.status === 'DONE';
  const rowBg = getRowBackground(task);

  return (
    <div
      className={`p-4 rounded-lg border border-gray-200 hover:shadow-sm transition group ${rowBg}`}
    >
      {/* Top row: checkbox, priority, title, entity */}
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onStatusChange(task.id, isDone ? 'TODO' : 'DONE')}
          className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
        />

        {/* Priority badge */}
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${getPriorityBadgeClass(task.priority)}`}
        >
          {task.priority}
        </span>

        {/* Title */}
        <button
          onClick={() => onSelect(task)}
          className={`flex-1 text-sm font-medium text-gray-900 text-left hover:text-blue-600 transition-colors ${isDone ? 'line-through text-gray-400' : ''}`}
        >
          {task.title}
        </button>

        {/* Entity badge (right side) */}
        {task.entityId && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
            {task.entityId}
          </span>
        )}
      </div>

      {/* Meta row: project, assignee, due date */}
      <div className="flex flex-wrap items-center gap-3 mt-1.5 ml-[3.5rem] text-xs text-gray-500">
        {task.projectId && (
          <span className="flex items-center gap-1">
            <span>&#128193;</span>
            {task.projectId}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span>&#128100;</span>
          Assigned: {task.assigneeId ? task.assigneeId : 'Me'}
        </span>
        {task.dueDate && (
          <span className="flex items-center gap-1">
            <span>&#128197;</span>
            Due: {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>

      {/* Dependencies row */}
      {task.dependencies.length > 0 && (
        <div className="mt-1 ml-[3.5rem] text-xs text-amber-600 flex items-center gap-1">
          <span>&#128279;</span>
          Blocked by: {task.dependencies.join(', ')} (in progress)
        </div>
      )}

      {/* Tags row */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 ml-[3.5rem]">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons — visible on hover */}
      <div className="flex gap-2 mt-2 ml-[3.5rem] opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onStart(task.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors"
        >
          &#9654; Start
        </button>
        <button
          onClick={() => onDelegate(task.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-colors"
        >
          &#8594; Delegate
        </button>
        <button
          onClick={() => onSnooze(task.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 transition-colors"
        >
          &#9200; Snooze
        </button>
        <button
          onClick={() => onSelect(task)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded text-gray-400 hover:text-gray-600 transition-colors"
          title="More options"
        >
          &#8943;
        </button>
      </div>
    </div>
  );
}
