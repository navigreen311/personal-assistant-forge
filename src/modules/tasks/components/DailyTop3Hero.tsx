'use client';

import type { Task } from '@/shared/types';

interface DailyTop3HeroProps {
  tasks: Task[];
  onComplete: (taskId: string) => void;
  onTaskClick: (task: Task) => void;
  onRefresh: () => void;
  onHide: () => void;
}

function formatDueDate(dueDate: Date | undefined): string {
  if (!dueDate) return 'No due date';

  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay.getTime() === today.getTime()) {
    const hours = due.getHours();
    const minutes = due.getMinutes();
    if (hours === 0 && minutes === 0) return 'Due: Today';
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutes = minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : '';
    return `Due: Today ${displayHour}${displayMinutes}${period}`;
  }

  if (dueDay.getTime() === tomorrow.getTime()) {
    return 'Due: Tomorrow';
  }

  return `Due: ${due.toLocaleDateString('en-US', { weekday: 'long' })}`;
}

function getPriorityBadgeClasses(priority: Task['priority']): string {
  switch (priority) {
    case 'P0':
      return 'bg-red-100 text-red-700';
    case 'P1':
      return 'bg-yellow-100 text-yellow-700';
    case 'P2':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export default function DailyTop3Hero({
  tasks,
  onComplete,
  onTaskClick,
  onRefresh,
  onHide,
}: DailyTop3HeroProps) {
  const displayTasks = tasks.slice(0, 3);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-gray-900">
          ✨ Your Top 3 Today
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            title="Refresh"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-600 rounded transition-colors"
          >
            {/* Refresh icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh
          </button>
          <button
            onClick={onHide}
            title="Hide"
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            {/* X icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Task list or empty state */}
      {displayTasks.length === 0 ? (
        <div className="mt-4 text-center py-4">
          <p className="text-sm text-gray-500">Looking good — light day ahead!</p>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {displayTasks.map((task, idx) => {
            const isCompleted = task.status === 'DONE';
            const hasDependencies = task.dependencies && task.dependencies.length > 0;

            return (
              <div
                key={task.id}
                className="flex items-start gap-3 py-3 border-b border-blue-100 last:border-0"
              >
                {/* Number */}
                <span className="text-lg font-bold text-blue-300 w-6 flex-shrink-0">
                  {idx + 1}.
                </span>

                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isCompleted}
                  onChange={() => onComplete(task.id)}
                  className="rounded-md border-gray-300 w-5 h-5 flex-shrink-0 mt-0.5 cursor-pointer accent-blue-600"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <button
                    onClick={() => onTaskClick(task)}
                    className={`text-sm font-medium text-left w-full ${
                      isCompleted
                        ? 'line-through text-gray-400'
                        : 'text-gray-900 hover:text-blue-700'
                    } transition-colors`}
                  >
                    {task.title}
                  </button>

                  {/* Meta */}
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{formatDueDate(task.dueDate)}</span>
                    <span>|</span>
                    {hasDependencies ? (
                      <span>
                        Depends on: {task.dependencies.length} task{task.dependencies.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-green-600">No blockers</span>
                    )}
                  </div>
                </div>

                {/* Right side: entity pill + priority badge */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 whitespace-nowrap">
                    {task.entityId}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPriorityBadgeClasses(task.priority)}`}
                  >
                    {task.priority}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-gray-400 italic mt-3">
        Selected based on deadlines, dependencies, and impact
      </p>
    </div>
  );
}
