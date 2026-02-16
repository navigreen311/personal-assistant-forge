'use client';

import { useState } from 'react';
import type { Task, TaskStatus, Priority } from '@/shared/types';

interface TaskKanbanViewProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  onAddTask?: () => void;
}

const COLUMNS: { status: TaskStatus; label: string; collapsible: boolean }[] = [
  { status: 'TODO', label: 'To Do', collapsible: false },
  { status: 'IN_PROGRESS', label: 'In Progress', collapsible: false },
  { status: 'BLOCKED', label: 'Blocked', collapsible: false },
  { status: 'DONE', label: 'Done', collapsible: true },
  { status: 'CANCELLED', label: 'Cancelled', collapsible: true },
];

const PRIORITY_BADGE: Record<Priority, string> = {
  P0: 'bg-red-500 text-white',
  P1: 'bg-yellow-500 text-white',
  P2: 'bg-blue-500 text-white',
};

const COLUMN_HEADER_COLORS: Record<TaskStatus, string> = {
  TODO: 'border-t-gray-400',
  IN_PROGRESS: 'border-t-blue-500',
  BLOCKED: 'border-t-red-500',
  DONE: 'border-t-green-500',
  CANCELLED: 'border-t-gray-300',
};

export default function TaskKanbanView({
  tasks,
  onStatusChange,
  onTaskClick,
  onAddTask,
}: TaskKanbanViewProps) {
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set(['CANCELLED']));
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const tasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (status: TaskStatus) => {
    if (draggedTaskId) {
      onStatusChange(draggedTaskId, status);
      setDraggedTaskId(null);
    }
  };

  const toggleCollapse = (status: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const formatDate = (date?: Date) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = (task: Task) =>
    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE' && task.status !== 'CANCELLED';

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
      {COLUMNS.map((col) => {
        const columnTasks = tasksByStatus(col.status);
        const isCollapsed = collapsed.has(col.status);

        return (
          <div
            key={col.status}
            className={`flex flex-col ${isCollapsed ? 'w-12' : 'w-72'} flex-shrink-0`}
          >
            {/* Column header */}
            <div
              className={`flex items-center justify-between px-3 py-2 bg-white border border-gray-200 border-t-4 ${COLUMN_HEADER_COLORS[col.status]} rounded-t-lg`}
            >
              {!isCollapsed && (
                <>
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                  <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                    {columnTasks.length}
                  </span>
                </>
              )}
              {col.collapsible && (
                <button
                  onClick={() => toggleCollapse(col.status)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  {isCollapsed ? '→' : '←'}
                </button>
              )}
            </div>

            {!isCollapsed && (
              <div
                className="flex-1 bg-gray-50 border border-t-0 border-gray-200 rounded-b-lg p-2 space-y-2 min-h-[200px]"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(col.status)}
              >
                {/* Add task button for TODO */}
                {col.status === 'TODO' && onAddTask && (
                  <button
                    onClick={onAddTask}
                    className="w-full py-2 text-sm text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors"
                  >
                    + Add Task
                  </button>
                )}

                {/* Task cards */}
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task.id)}
                    onClick={() => onTaskClick(task)}
                    className={`bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow ${
                      draggedTaskId === task.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${PRIORITY_BADGE[task.priority]}`}>
                        {task.priority}
                      </span>
                      {task.dueDate && (
                        <span className={`text-[10px] ${isOverdue(task) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-2 line-clamp-2">{task.title}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {task.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {task.assigneeId && (
                        <span className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium text-white">
                          {task.assigneeId.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {columnTasks.length === 0 && col.status !== 'TODO' && (
                  <p className="text-xs text-gray-400 text-center py-8">No tasks</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
