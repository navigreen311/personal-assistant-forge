'use client';

import Link from 'next/link';

interface DailyTop3Task {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  entityName: string;
  dueDate?: string;
  dependencies: string[];
  status: string;
}

interface DailyTop3CardProps {
  tasks: DailyTop3Task[];
}

const PRIORITY_STYLES: Record<'P0' | 'P1' | 'P2', string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-blue-100 text-blue-700',
};

function formatDueDate(dueDateStr: string): string {
  const due = new Date(dueDateStr);
  const now = new Date();

  // Strip time for day-level comparisons
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = due.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: due.getMinutes() !== 0 ? '2-digit' : undefined,
    hour12: true,
  });

  if (diffDays === 0) {
    return `Today ${timeStr}`;
  }
  if (diffDays === 1) {
    return 'Tomorrow';
  }
  if (diffDays > 1 && diffDays < 7) {
    return due.toLocaleDateString('en-US', { weekday: 'long' });
  }

  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DailyTop3Card({ tasks }: DailyTop3CardProps) {
  const displayTasks = tasks.slice(0, 3);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" aria-hidden="true">✨</span>
          <h2 className="font-semibold text-gray-900 text-sm">Your Top 3 Today</h2>
        </div>
        <Link
          href="/tasks"
          className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all tasks →
        </Link>
      </div>

      {/* Empty state */}
      {displayTasks.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-500">Looking good — light day ahead</p>
        </div>
      ) : (
        <>
          {/* Task rows */}
          <div className="divide-y divide-gray-100">
            {displayTasks.map((task) => (
              <div key={task.id} className="py-3 flex items-start gap-3">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  readOnly
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0 cursor-pointer"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Priority badge */}
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${PRIORITY_STYLES[task.priority]}`}
                    >
                      {task.priority}
                    </span>

                    {/* Task title */}
                    <Link
                      href="/tasks"
                      className="font-medium text-gray-900 truncate text-sm hover:text-blue-600 transition-colors min-w-0"
                    >
                      {task.title}
                    </Link>

                    {/* Entity tag */}
                    <span className="inline-flex items-center bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                      {task.entityName}
                    </span>

                    {/* Due date */}
                    {task.dueDate && (
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatDueDate(task.dueDate)}
                      </span>
                    )}
                  </div>

                  {/* Dependencies */}
                  {task.dependencies.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Depends on: {task.dependencies.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-3 text-xs text-gray-400 italic">
            ✨ Selected based on deadlines, dependencies, and your energy pattern
          </p>
        </>
      )}
    </div>
  );
}
