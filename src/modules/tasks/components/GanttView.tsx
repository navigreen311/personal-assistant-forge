'use client';

import { useState, useMemo, useRef } from 'react';
import type { Task } from '@/shared/types';

interface GanttViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDateChange?: (taskId: string, start: Date, end: Date) => void;
}

// --- Color palette for entity hashing ---
const ENTITY_BAR_COLORS = [
  'bg-violet-400',
  'bg-blue-400',
  'bg-cyan-400',
  'bg-teal-400',
  'bg-green-400',
  'bg-lime-500',
  'bg-orange-400',
  'bg-pink-400',
  'bg-indigo-400',
  'bg-rose-400',
];

const _ENTITY_BADGE_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-teal-100 text-teal-700',
  'bg-green-100 text-green-700',
  'bg-lime-100 text-lime-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-rose-100 text-rose-700',
];

function hashEntityId(entityId: string): number {
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = (hash * 31 + entityId.charCodeAt(i)) >>> 0;
  }
  return hash % ENTITY_BAR_COLORS.length;
}

const PRIORITY_BADGE: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-blue-100 text-blue-700',
};

// --- Date/column geometry ---
const COL_WIDTH = 40; // px per day
const ROW_HEIGHT = 40; // px per task row
const BAR_HEIGHT = 20; // px, centred in row
const BAR_MARGIN_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const HEADER_HEIGHT = 48; // px

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function formatDay(d: Date): string {
  return String(d.getDate());
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// Build date range: from the earliest task date to 60 days after, minimum 60 days
function buildDateRange(tasks: Task[]): { rangeStart: Date; totalDays: number } {
  const today = startOfDay(new Date());
  const dates: Date[] = [today];

  for (const t of tasks) {
    if (t.createdAt) dates.push(startOfDay(new Date(t.createdAt)));
    if (t.dueDate) dates.push(startOfDay(new Date(t.dueDate)));
  }

  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));

  // Start a little before earliest
  const rangeStart = addDays(earliest, -2);
  // End at least 60 days from range start, or 7 days after latest
  const minEnd = addDays(rangeStart, 60);
  const dataEnd = addDays(latest, 7);
  const rangeEnd = new Date(Math.max(minEnd.getTime(), dataEnd.getTime()));

  const totalDays = diffDays(rangeStart, rangeEnd);
  return { rangeStart, totalDays };
}

// Group tasks by project/entity
function groupTasks(tasks: Task[]): { groupKey: string; tasks: Task[] }[] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.projectId ?? `entity:${task.entityId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }
  return Array.from(groups.entries()).map(([groupKey, groupTasks]) => ({
    groupKey,
    tasks: groupTasks,
  }));
}

function groupLabel(key: string): string {
  if (key.startsWith('entity:')) return `Entity: ${key.slice(7)}`;
  return `Project: ${key}`;
}

// --- Tooltip ---
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  task: Task | null;
}

// --- Dependency SVG lines ---
// For each dependency edge, draw a thin line from the right edge of the blocking task bar
// to the left edge of the dependent task bar.
interface BarInfo {
  taskId: string;
  barLeft: number;
  barRight: number;
  barTop: number; // relative to timeline panel top
}

export default function GanttView({ tasks, onTaskClick }: GanttViewProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, task: null });
  const timelinePanelRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => startOfDay(new Date()), []);

  // Tasks with at least a created date
  const { rangeStart, totalDays } = useMemo(() => buildDateRange(tasks), [tasks]);

  const groups = useMemo(() => groupTasks(tasks), [tasks]);

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Build a flat ordered list of tasks (for row index lookup)
  const flatRows = useMemo(() => {
    const rows: Array<{ task: Task; isGroupHeader: boolean; groupKey: string }> = [];
    for (const group of groups) {
      rows.push({ task: group.tasks[0], isGroupHeader: true, groupKey: group.groupKey });
      for (const task of group.tasks) {
        rows.push({ task, isGroupHeader: false, groupKey: group.groupKey });
      }
    }
    return rows;
  }, [groups]);

  // Build bar infos for dependency lines
  const barInfos = useMemo<BarInfo[]>(() => {
    const infos: BarInfo[] = [];
    let rowIndex = 0;
    for (const row of flatRows) {
      if (row.isGroupHeader) {
        // group header occupies a row slot
        rowIndex++;
        continue;
      }
      const task = row.task;
      const start = task.createdAt ? startOfDay(new Date(task.createdAt)) : today;
      const end = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;
      const barLeft = diffDays(rangeStart, start) * COL_WIDTH;
      const barRight = end ? diffDays(rangeStart, end) * COL_WIDTH : barLeft + COL_WIDTH;
      const barTop = rowIndex * ROW_HEIGHT + BAR_MARGIN_TOP;
      infos.push({ taskId: task.id, barLeft, barRight, barTop });
      rowIndex++;
    }
    return infos;
  }, [flatRows, rangeStart, today]);

  const barInfoMap = useMemo(() => new Map(barInfos.map((b) => [b.taskId, b])), [barInfos]);

  // Dependency edges for SVG
  const depEdges = useMemo(() => {
    const result: Array<{ fromId: string; toId: string }> = [];
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (taskMap.has(depId)) {
          result.push({ fromId: depId, toId: task.id });
        }
      }
    }
    return result;
  }, [tasks, taskMap]);

  // Column header data
  const columns = useMemo(() => {
    const cols: Array<{ date: Date; isToday: boolean; isWeekend: boolean }> = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      const dow = d.getDay();
      cols.push({
        date: d,
        isToday: d.getTime() === today.getTime(),
        isWeekend: dow === 0 || dow === 6,
      });
    }
    return cols;
  }, [rangeStart, totalDays, today]);

  // Month spans for header
  const monthSpans = useMemo(() => {
    const spans: Array<{ label: string; startCol: number; span: number }> = [];
    let currentMonth = -1;
    let currentStart = 0;
    let currentSpan = 0;
    columns.forEach((col, i) => {
      const m = col.date.getMonth();
      if (m !== currentMonth) {
        if (currentSpan > 0) spans.push({ label: formatMonthYear(columns[currentStart].date), startCol: currentStart, span: currentSpan });
        currentMonth = m;
        currentStart = i;
        currentSpan = 1;
      } else {
        currentSpan++;
      }
    });
    if (currentSpan > 0) spans.push({ label: formatMonthYear(columns[currentStart].date), startCol: currentStart, span: currentSpan });
    return spans;
  }, [columns]);

  const todayColOffset = diffDays(rangeStart, today) * COL_WIDTH;
  const totalTimelineWidth = totalDays * COL_WIDTH;

  const handleBarMouseEnter = (e: React.MouseEvent, task: Task) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ visible: true, x: rect.left + rect.width / 2, y: rect.top - 8, task });
  };

  const handleBarMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, task: null });
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-14 h-14 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.2}
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M9 4v5M15 4v5" strokeLinecap="round" />
          <rect x="6" y="13" width="5" height="3" rx="1" />
          <rect x="13" y="13" width="5" height="3" rx="1" />
        </svg>
        <p className="text-sm text-center max-w-xs text-gray-500">
          No tasks with dates. Add due dates to see your timeline.
        </p>
      </div>
    );
  }

  const hasDates = tasks.some((t) => t.dueDate);
  if (!hasDates) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-14 h-14 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.2}
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M9 4v5M15 4v5" strokeLinecap="round" />
          <rect x="6" y="13" width="5" height="3" rx="1" />
          <rect x="13" y="13" width="5" height="3" rx="1" />
        </svg>
        <p className="text-sm text-center max-w-xs text-gray-500">
          No tasks with dates. Add due dates to see your timeline.
        </p>
      </div>
    );
  }

  // Total content height for the SVG dep overlay
  let totalRowCount = 0;
  for (const group of groups) {
    totalRowCount += 1 + group.tasks.length; // header + tasks
  }
  const contentHeight = totalRowCount * ROW_HEIGHT;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Main layout: left panel + right scrollable timeline */}
      <div className="flex overflow-hidden">
        {/* Left panel — task names */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col">
          {/* Left header */}
          <div
            className="flex items-end px-3 pb-1 border-b border-gray-200 bg-gray-50"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</span>
          </div>

          {/* Task rows */}
          <div className="flex flex-col overflow-hidden">
            {groups.map((group) => (
              <div key={group.groupKey}>
                {/* Group header row */}
                <div
                  className="flex items-center px-3 bg-gray-50 border-b border-gray-100"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                    {groupLabel(group.groupKey)}
                  </span>
                </div>

                {/* Task rows */}
                {group.tasks.map((task) => {
                  const colorIdx = hashEntityId(task.entityId);
                  const priorityClass = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.P2;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center px-3 gap-2 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => onTaskClick(task)}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ENTITY_BAR_COLORS[colorIdx]}`}
                      />
                      <span className="text-sm text-gray-700 truncate flex-1 leading-none" title={task.title}>
                        {task.title}
                      </span>
                      <span
                        className={`flex-shrink-0 text-[10px] font-bold px-1 py-0.5 rounded leading-none ${priorityClass}`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — timeline */}
        <div className="flex-1 overflow-x-auto overflow-y-auto" ref={timelinePanelRef}>
          <div style={{ width: totalTimelineWidth, minWidth: totalTimelineWidth }}>
            {/* Header: month row + day row */}
            <div
              className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200"
              style={{ height: HEADER_HEIGHT }}
            >
              {/* Month labels */}
              <div className="flex" style={{ height: 24 }}>
                {monthSpans.map((span) => (
                  <div
                    key={`${span.label}-${span.startCol}`}
                    className="flex items-center justify-start px-2 text-[11px] font-semibold text-gray-500 border-r border-gray-200 overflow-hidden"
                    style={{ width: span.span * COL_WIDTH, flexShrink: 0 }}
                  >
                    {span.label}
                  </div>
                ))}
              </div>

              {/* Day labels */}
              <div className="flex" style={{ height: 24 }}>
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-center text-[10px] border-r border-gray-100 flex-shrink-0 ${
                      col.isToday
                        ? 'bg-red-50 text-red-600 font-bold'
                        : col.isWeekend
                        ? 'text-gray-300'
                        : 'text-gray-400'
                    }`}
                    style={{ width: COL_WIDTH }}
                  >
                    {formatDay(col.date)}
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline body */}
            <div className="relative" style={{ height: contentHeight }}>
              {/* Background column stripes (weekends + today) */}
              <div className="absolute inset-0 flex pointer-events-none">
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className={`flex-shrink-0 border-r border-gray-50 ${
                      col.isToday ? 'bg-red-50/40' : col.isWeekend ? 'bg-gray-50' : ''
                    }`}
                    style={{ width: COL_WIDTH, height: contentHeight }}
                  />
                ))}
              </div>

              {/* Today red vertical line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none"
                style={{ left: todayColOffset }}
              />

              {/* SVG dependency lines overlay */}
              <svg
                className="absolute inset-0 pointer-events-none"
                style={{ width: totalTimelineWidth, height: contentHeight, zIndex: 5 }}
                viewBox={`0 0 ${totalTimelineWidth} ${contentHeight}`}
              >
                <defs>
                  <marker
                    id="gantt-arrow"
                    markerWidth="6"
                    markerHeight="5"
                    refX="6"
                    refY="2.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 2.5, 0 5" fill="#A78BFA" />
                  </marker>
                </defs>
                {depEdges.map((edge, i) => {
                  const from = barInfoMap.get(edge.fromId);
                  const to = barInfoMap.get(edge.toId);
                  if (!from || !to) return null;
                  const x1 = from.barRight;
                  const y1 = from.barTop + BAR_HEIGHT / 2;
                  const x2 = to.barLeft;
                  const y2 = to.barTop + BAR_HEIGHT / 2;
                  const midX = (x1 + x2) / 2;
                  return (
                    <path
                      key={`dep-${i}`}
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#A78BFA"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      markerEnd="url(#gantt-arrow)"
                      opacity={0.7}
                    />
                  );
                })}
              </svg>

              {/* Task bars */}
              <div className="relative z-20">
                {groups.map((group) => (
                  <div key={group.groupKey}>
                    {/* Group header spacer row */}
                    <div style={{ height: ROW_HEIGHT }} className="border-b border-gray-100" />

                    {/* Task bar rows */}
                    {group.tasks.map((task) => {
                      const colorIdx = hashEntityId(task.entityId);
                      const barColorClass = ENTITY_BAR_COLORS[colorIdx];

                      const taskStart = task.createdAt
                        ? startOfDay(new Date(task.createdAt))
                        : today;
                      const taskEnd = task.dueDate
                        ? startOfDay(new Date(task.dueDate))
                        : null;

                      const barLeft = Math.max(0, diffDays(rangeStart, taskStart)) * COL_WIDTH;
                      const barWidth = taskEnd
                        ? Math.max(COL_WIDTH, diffDays(taskStart, taskEnd) * COL_WIDTH)
                        : COL_WIDTH; // dot-sized if no due date

                      const isOverdue =
                        task.dueDate &&
                        task.status !== 'DONE' &&
                        task.status !== 'CANCELLED' &&
                        startOfDay(new Date(task.dueDate)) < today;

                      const isMilestone = !task.dueDate; // treat no-due-date as dot/milestone marker
                      const isDone = task.status === 'DONE';
                      const isCancelled = task.status === 'CANCELLED';

                      return (
                        <div
                          key={task.id}
                          className="relative border-b border-gray-50"
                          style={{ height: ROW_HEIGHT }}
                        >
                          {isMilestone ? (
                            /* Diamond milestone marker */
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-gray-400 cursor-pointer hover:scale-125 transition-transform"
                              style={{ left: barLeft + COL_WIDTH / 2 }}
                              onClick={() => onTaskClick(task)}
                              title={task.title}
                            />
                          ) : (
                            /* Task bar */
                            <div
                              className={`absolute rounded-md cursor-pointer transition-opacity hover:opacity-90 flex items-center overflow-hidden ${
                                isCancelled
                                  ? 'bg-gray-300 opacity-50'
                                  : isDone
                                  ? 'bg-green-400'
                                  : isOverdue
                                  ? `${barColorClass} border-2 border-dashed border-red-500`
                                  : barColorClass
                              }`}
                              style={{
                                left: barLeft,
                                top: BAR_MARGIN_TOP,
                                width: barWidth,
                                height: BAR_HEIGHT,
                              }}
                              onClick={() => onTaskClick(task)}
                              onMouseEnter={(e) => handleBarMouseEnter(e, task)}
                              onMouseLeave={handleBarMouseLeave}
                              title={task.title}
                            >
                              {/* Bar label (only if bar is wide enough) */}
                              {barWidth > 60 && (
                                <span className="px-1.5 text-white text-[10px] font-medium truncate leading-none drop-shadow-sm">
                                  {task.title}
                                </span>
                              )}
                              {/* Overdue striped overlay */}
                              {isOverdue && (
                                <div
                                  className="absolute inset-0 opacity-20 rounded-md"
                                  style={{
                                    background:
                                      'repeating-linear-gradient(45deg, #ef4444, #ef4444 4px, transparent 4px, transparent 10px)',
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip — fixed position */}
      {tooltip.visible && tooltip.task && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 max-w-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-semibold mb-1 leading-tight">{tooltip.task.title}</p>
          <p className="text-gray-300">
            Status:{' '}
            <span className="text-white">{tooltip.task.status.replace('_', ' ')}</span>
          </p>
          {tooltip.task.dueDate && (
            <p className="text-gray-300">
              Due:{' '}
              <span className="text-white">
                {new Date(tooltip.task.dueDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </p>
          )}
          {tooltip.task.createdAt && (
            <p className="text-gray-300">
              Created:{' '}
              <span className="text-white">
                {new Date(tooltip.task.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </p>
          )}
          <p className="text-gray-300">
            Priority: <span className="text-white">{tooltip.task.priority}</span>
          </p>
        </div>
      )}

      {/* Footer legend */}
      <div className="flex items-center gap-5 px-4 py-2 border-t border-gray-100 text-xs text-gray-500 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-3 rounded-sm bg-green-400 inline-block" /> Done
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-5 h-3 rounded-sm bg-blue-400 border-2 border-dashed border-red-500 inline-block"
          />
          Overdue
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rotate-45 bg-gray-400 inline-block" /> No due date (milestone)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-red-400 inline-block" /> Today
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-5 h-0.5 inline-block"
            style={{
              background:
                'repeating-linear-gradient(90deg, #A78BFA 0, #A78BFA 4px, transparent 4px, transparent 8px)',
            }}
          />
          Dependency
        </div>
      </div>
    </div>
  );
}
