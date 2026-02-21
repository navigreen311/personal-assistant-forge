'use client';

import { useMemo, useState } from 'react';
import type { Task } from '@/shared/types';
import type { EisenhowerQuadrant } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PriorityMatrixProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onQuadrantChange?: (taskId: string, quadrant: EisenhowerQuadrant) => void;
}

// ---------------------------------------------------------------------------
// Quadrant configuration
// ---------------------------------------------------------------------------

interface QuadrantConfig {
  label: string;
  subtitle: string;
  emoji: string;
  borderClass: string;
  bgClass: string;
  headerTextClass: string;
  subtitleTextClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  emptyTextClass: string;
}

const QUADRANT_CONFIG: Record<EisenhowerQuadrant, QuadrantConfig> = {
  DO_FIRST: {
    label: 'Do First',
    subtitle: 'Urgent & Important',
    emoji: '🔴',
    borderClass: 'border-red-200',
    bgClass: 'bg-red-50/30',
    headerTextClass: 'text-red-700',
    subtitleTextClass: 'text-red-500',
    badgeBgClass: 'bg-red-100',
    badgeTextClass: 'text-red-700',
    emptyTextClass: 'text-red-300',
  },
  SCHEDULE: {
    label: 'Schedule',
    subtitle: 'Important, Not Urgent',
    emoji: '📅',
    borderClass: 'border-blue-200',
    bgClass: 'bg-blue-50/30',
    headerTextClass: 'text-blue-700',
    subtitleTextClass: 'text-blue-500',
    badgeBgClass: 'bg-blue-100',
    badgeTextClass: 'text-blue-700',
    emptyTextClass: 'text-blue-300',
  },
  DELEGATE: {
    label: 'Delegate',
    subtitle: 'Urgent, Not Important',
    emoji: '👤',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50/30',
    headerTextClass: 'text-amber-700',
    subtitleTextClass: 'text-amber-500',
    badgeBgClass: 'bg-amber-100',
    badgeTextClass: 'text-amber-700',
    emptyTextClass: 'text-amber-300',
  },
  ELIMINATE: {
    label: 'Eliminate',
    subtitle: 'Neither',
    emoji: '🗑',
    borderClass: 'border-gray-200',
    bgClass: 'bg-gray-50/30',
    headerTextClass: 'text-gray-700',
    subtitleTextClass: 'text-gray-500',
    badgeBgClass: 'bg-gray-100',
    badgeTextClass: 'text-gray-700',
    emptyTextClass: 'text-gray-400',
  },
};

// Render order: top-left, top-right, bottom-left, bottom-right
const QUADRANT_ORDER: EisenhowerQuadrant[] = ['DO_FIRST', 'SCHEDULE', 'DELEGATE', 'ELIMINATE'];

// ---------------------------------------------------------------------------
// Priority badge classes
// ---------------------------------------------------------------------------

const PRIORITY_BADGE: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-yellow-100 text-yellow-700',
  P2: 'bg-blue-100 text-blue-700',
};

// ---------------------------------------------------------------------------
// Entity color palette (cycles by entityId)
// ---------------------------------------------------------------------------

const ENTITY_COLORS = [
  'bg-violet-400',
  'bg-emerald-400',
  'bg-sky-400',
  'bg-orange-400',
  'bg-pink-400',
  'bg-teal-400',
  'bg-indigo-400',
  'bg-rose-400',
];

function buildEntityColorMap(tasks: Task[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const task of tasks) {
    if (!map.has(task.entityId)) {
      map.set(task.entityId, ENTITY_COLORS[idx % ENTITY_COLORS.length]);
      idx++;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Auto-classification logic
// ---------------------------------------------------------------------------

function classifyTask(task: Task, today: Date): EisenhowerQuadrant {
  const { priority, dueDate } = task;

  let isUrgent = false;
  if (dueDate) {
    const due = new Date(dueDate);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    isUrgent = dueDay <= todayDay;
  }

  if (priority === 'P0') {
    // P0 = Important; urgency determines DO_FIRST vs SCHEDULE
    return isUrgent ? 'DO_FIRST' : 'SCHEDULE';
  }

  if (priority === 'P1') {
    // P1 = Less critical; urgency determines DELEGATE vs ELIMINATE
    return isUrgent ? 'DELEGATE' : 'ELIMINATE';
  }

  // P2 = Low importance → always ELIMINATE
  return 'ELIMINATE';
}

// ---------------------------------------------------------------------------
// DraggableTaskPill
// ---------------------------------------------------------------------------

interface DraggableTaskPillProps {
  task: Task;
  entityColorClass: string;
  onClick: (task: Task) => void;
  onDragStart: () => void;
}

function DraggableTaskPill({
  task,
  entityColorClass,
  onClick,
  onDragStart,
}: DraggableTaskPillProps) {
  const badgeClass = PRIORITY_BADGE[task.priority] ?? 'bg-gray-100 text-gray-600';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={() => onClick(task)}
      className="flex items-center gap-2 p-2 bg-white rounded-md border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Priority badge */}
      <span className={`flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${badgeClass}`}>
        {task.priority}
      </span>

      {/* Task title */}
      <span className="flex-1 text-sm text-gray-800 truncate min-w-0">
        {task.title}
      </span>

      {/* Entity color dot */}
      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${entityColorClass}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuadrantPanel
// ---------------------------------------------------------------------------

interface QuadrantPanelProps {
  quadrant: EisenhowerQuadrant;
  config: QuadrantConfig;
  tasks: Task[];
  entityColorMap: Map<string, string>;
  onTaskClick: (task: Task) => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onTaskDragStart: (taskId: string) => void;
}

function QuadrantPanel({
  quadrant: _quadrant,
  config,
  tasks,
  entityColorMap,
  onTaskClick,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onTaskDragStart,
}: QuadrantPanelProps) {
  return (
    <div
      className={[
        config.bgClass,
        config.borderClass,
        isDragOver ? 'ring-2 ring-inset ring-gray-400 opacity-90' : '',
        'border-2 rounded-lg p-4 flex flex-col h-full transition-all duration-150',
      ].join(' ')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3 flex-shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className={`text-sm font-semibold ${config.headerTextClass}`}>
            {config.emoji} {config.label}
          </span>
          <span className={`text-xs ${config.subtitleTextClass}`}>
            ({config.subtitle})
          </span>
        </div>

        {/* Count badge */}
        <span
          className={`${config.badgeBgClass} ${config.badgeTextClass} text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-2`}
        >
          {tasks.length}
        </span>
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-60 pr-0.5">
        {tasks.length === 0 ? (
          <p className={`text-xs italic text-center py-6 ${config.emptyTextClass}`}>
            No tasks
          </p>
        ) : (
          tasks.map((task) => (
            <DraggableTaskPill
              key={task.id}
              task={task}
              entityColorClass={entityColorMap.get(task.entityId) ?? 'bg-gray-300'}
              onClick={onTaskClick}
              onDragStart={() => onTaskDragStart(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PriorityMatrix (main export)
// ---------------------------------------------------------------------------

export default function PriorityMatrix({
  tasks,
  onTaskClick,
  onQuadrantChange,
}: PriorityMatrixProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverQuadrant, setDragOverQuadrant] = useState<EisenhowerQuadrant | null>(null);

  const today = useMemo(() => new Date(), []);
  const entityColorMap = useMemo(() => buildEntityColorMap(tasks), [tasks]);

  const quadrantMap = useMemo<Record<EisenhowerQuadrant, Task[]>>(() => {
    const result: Record<EisenhowerQuadrant, Task[]> = {
      DO_FIRST: [],
      SCHEDULE: [],
      DELEGATE: [],
      ELIMINATE: [],
    };
    for (const task of tasks) {
      result[classifyTask(task, today)].push(task);
    }
    return result;
  }, [tasks, today]);

  function handleDragStart(taskId: string) {
    setDraggedTaskId(taskId);
  }

  function handleDragOver(e: React.DragEvent, quadrant: EisenhowerQuadrant) {
    e.preventDefault();
    setDragOverQuadrant(quadrant);
  }

  function handleDragLeave() {
    setDragOverQuadrant(null);
  }

  function handleDrop(quadrant: EisenhowerQuadrant) {
    if (draggedTaskId && onQuadrantChange) {
      onQuadrantChange(draggedTaskId, quadrant);
    }
    setDraggedTaskId(null);
    setDragOverQuadrant(null);
  }

  function handleDragEnd() {
    setDraggedTaskId(null);
    setDragOverQuadrant(null);
  }

  // Overall empty state
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center px-8">
        <span className="text-4xl mb-4" aria-hidden>📋</span>
        <p className="text-base font-medium text-gray-600 mb-1">
          No tasks to classify.
        </p>
        <p className="text-sm text-gray-400">
          Create tasks to see your priority matrix.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-stretch mb-3">
        {/* Vertical axis label */}
        <div className="flex items-center justify-center w-6 mr-2 flex-shrink-0">
          <span
            className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest select-none"
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
          >
            Important &darr; Not Important
          </span>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Horizontal axis label */}
          <div className="flex justify-between mb-1 px-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest select-none">
              Urgent
            </span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest select-none">
              Not Urgent
            </span>
          </div>

          {/* 2x2 grid */}
          <div
            className="grid grid-cols-2 gap-4 flex-1 min-h-[500px]"
            onDragEnd={handleDragEnd}
          >
            {QUADRANT_ORDER.map((quadrant) => (
              <QuadrantPanel
                key={quadrant}
                quadrant={quadrant}
                config={QUADRANT_CONFIG[quadrant]}
                tasks={quadrantMap[quadrant]}
                entityColorMap={entityColorMap}
                onTaskClick={onTaskClick}
                isDragOver={dragOverQuadrant === quadrant}
                onDragOver={(e) => handleDragOver(e, quadrant)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(quadrant)}
                onTaskDragStart={handleDragStart}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
