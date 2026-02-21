'use client';

import { useState, useMemo } from 'react';
import type { Task } from '@/shared/types';

interface DependencyGraphViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

// --- Color palette for entity hashing ---
const ENTITY_BORDER_COLORS = [
  'border-violet-500',
  'border-blue-500',
  'border-cyan-500',
  'border-teal-500',
  'border-green-500',
  'border-lime-500',
  'border-orange-500',
  'border-pink-500',
  'border-indigo-500',
  'border-rose-500',
];

function hashEntityId(entityId: string): number {
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = (hash * 31 + entityId.charCodeAt(i)) >>> 0;
  }
  return hash % ENTITY_BORDER_COLORS.length;
}

const PRIORITY_BORDER_WIDTH: Record<string, string> = {
  P0: 'border-4',
  P1: 'border-2',
  P2: 'border',
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  P0: { bg: 'bg-red-100', text: 'text-red-700' },
  P1: { bg: 'bg-amber-100', text: 'text-amber-700' },
  P2: { bg: 'bg-blue-100', text: 'text-blue-700' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  TODO: { bg: 'bg-gray-100', text: 'text-gray-600' },
  IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-700' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-700' },
  DONE: { bg: 'bg-green-100', text: 'text-green-700' },
  CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-400' },
};

// --- Graph building helpers ---

interface GraphNode {
  task: Task;
  depth: number;
  columnIndex: number;
  rowIndex: number;
  isCriticalPath: boolean;
  isBlocked: boolean;
  entityColorIndex: number;
}

interface GraphEdge {
  fromTaskId: string;
  toTaskId: string;
  isCriticalPath: boolean;
}

function buildGraph(tasks: Task[]): { nodes: GraphNode[]; edges: GraphEdge[]; criticalPathIds: Set<string> } {
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const edges: GraphEdge[] = [];

  // Build adjacency: who depends on whom
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (taskMap.has(depId)) {
        edges.push({ fromTaskId: depId, toTaskId: task.id, isCriticalPath: false });
      }
    }
  }

  // Assign depths via BFS (tasks with no dependencies are depth 0)
  const depths = new Map<string, number>();

  const roots = tasks.filter((t) => t.dependencies.every((d) => !taskMap.has(d)));
  const queue = [...roots];
  for (const r of roots) depths.set(r.id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current.id) ?? 0;
    for (const edge of edges) {
      if (edge.fromTaskId === current.id) {
        const existing = depths.get(edge.toTaskId) ?? -1;
        if (currentDepth + 1 > existing) {
          depths.set(edge.toTaskId, currentDepth + 1);
          const toTask = taskMap.get(edge.toTaskId);
          if (toTask) queue.push(toTask);
        }
      }
    }
  }

  // Tasks not yet assigned a depth (isolated or no explicit root)
  for (const task of tasks) {
    if (!depths.has(task.id)) depths.set(task.id, 0);
  }

  const maxDepth = Math.max(...Array.from(depths.values()), 0);

  // Identify critical path: longest chain of P0/IN_PROGRESS/BLOCKED tasks
  const criticalPathIds = new Set<string>();
  function findLongestPath(taskId: string, visited: Set<string>): string[] {
    if (visited.has(taskId)) return [];
    visited.add(taskId);
    const outgoing = edges.filter((e) => e.fromTaskId === taskId);
    if (outgoing.length === 0) return [taskId];
    let longest: string[] = [];
    for (const edge of outgoing) {
      const path = findLongestPath(edge.toTaskId, new Set(visited));
      if (path.length > longest.length) longest = path;
    }
    return [taskId, ...longest];
  }

  const rootIds = tasks.filter((t) => depths.get(t.id) === 0).map((t) => t.id);
  let overallLongest: string[] = [];
  for (const rootId of rootIds) {
    const path = findLongestPath(rootId, new Set());
    if (path.length > overallLongest.length) overallLongest = path;
  }
  overallLongest.forEach((id) => criticalPathIds.add(id));

  // Mark critical path edges
  for (const edge of edges) {
    if (criticalPathIds.has(edge.fromTaskId) && criticalPathIds.has(edge.toTaskId)) {
      edge.isCriticalPath = true;
    }
  }

  // Group tasks by column (depth)
  const columns: Task[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const task of tasks) {
    const depth = depths.get(task.id) ?? 0;
    columns[depth].push(task);
  }

  const nodes: GraphNode[] = [];
  for (let col = 0; col <= maxDepth; col++) {
    const colTasks = columns[col] ?? [];
    colTasks.forEach((task, rowIndex) => {
      nodes.push({
        task,
        depth: col,
        columnIndex: col,
        rowIndex,
        isCriticalPath: criticalPathIds.has(task.id),
        isBlocked: task.status === 'BLOCKED',
        entityColorIndex: hashEntityId(task.entityId),
      });
    });
  }

  return { nodes, edges, criticalPathIds };
}

// --- SVG connector rendering ---
// Each node card: 192px wide (w-48), 88px tall estimate, column gap: 80px, row gap: 16px
const CARD_W = 192;
const CARD_H = 100;
const COL_GAP = 80;
const ROW_GAP = 16;
const PADDING = 24;

function getNodeCenter(node: GraphNode): { x: number; y: number } {
  // Maximum rows across all columns (for consistent spacing), we calculate from rowIndex
  const x = PADDING + node.columnIndex * (CARD_W + COL_GAP) + CARD_W / 2;
  const y = PADDING + node.rowIndex * (CARD_H + ROW_GAP) + CARD_H / 2;
  return { x, y };
}

function getNodeRight(node: GraphNode): { x: number; y: number } {
  const center = getNodeCenter(node);
  return { x: center.x + CARD_W / 2, y: center.y };
}

function getNodeLeft(node: GraphNode): { x: number; y: number } {
  const center = getNodeCenter(node);
  return { x: center.x - CARD_W / 2, y: center.y };
}

export default function DependencyGraphView({ tasks, onTaskClick }: DependencyGraphViewProps) {
  const [filterEntityId, setFilterEntityId] = useState<string>('ALL');

  const entityIds = useMemo(() => {
    const ids = Array.from(new Set(tasks.map((t) => t.entityId)));
    return ids;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filterEntityId === 'ALL') return tasks;
    return tasks.filter((t) => t.entityId === filterEntityId);
  }, [tasks, filterEntityId]);

  const { nodes, edges } = useMemo(() => buildGraph(filteredTasks), [filteredTasks]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.task.id, n])), [nodes]);

  // SVG canvas dimensions
  const maxCol = nodes.length > 0 ? Math.max(...nodes.map((n) => n.columnIndex)) : 0;
  const maxRow = nodes.length > 0 ? Math.max(...nodes.map((n) => n.rowIndex)) : 0;
  const svgWidth = PADDING * 2 + (maxCol + 1) * CARD_W + maxCol * COL_GAP;
  const svgHeight = PADDING * 2 + (maxRow + 1) * CARD_H + maxRow * ROW_GAP;

  if (tasks.length === 0 || nodes.filter((n) => n.task.dependencies.length > 0 || edges.some((e) => e.toTaskId === n.task.id || e.fromTaskId === n.task.id)).length === 0) {
    // Show empty state if no tasks have any dependency connections
    const hasAnyEdge = edges.length > 0;
    if (!hasAnyEdge && tasks.length > 0) {
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
            <circle cx="5" cy="12" r="2" />
            <circle cx="19" cy="6" r="2" />
            <circle cx="19" cy="18" r="2" />
            <path d="M7 12h4m2-4.5 2 4.5m-2 4.5 2-4.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-center max-w-xs text-gray-500">
            No dependencies yet. Link tasks in the create/edit modal to visualize your critical path.
          </p>
        </div>
      );
    }
  }

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
          <circle cx="5" cy="12" r="2" />
          <circle cx="19" cy="6" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M7 12h4m2-4.5 2 4.5m-2 4.5 2-4.5" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-center max-w-xs text-gray-500">
          No dependencies yet. Link tasks in the create/edit modal to visualize your critical path.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter Controls */}
      <div className="flex items-center gap-2 px-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</label>
        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={filterEntityId}
          onChange={(e) => setFilterEntityId(e.target.value)}
        >
          <option value="ALL">All Entities</option>
          {entityIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400">{nodes.length} tasks</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-red-500 bg-red-50 inline-block" />
          Critical path
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-amber-400 shadow-amber-200 shadow-sm bg-amber-50 inline-block" />
          Blocked
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-gray-400 text-xs">border width</span> = priority (P0 thicker)
        </div>
      </div>

      {/* Graph canvas */}
      <div className="overflow-auto border border-gray-200 rounded-xl bg-gray-50 relative" style={{ minHeight: 300 }}>
        {/* SVG for connector lines — rendered behind cards */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: svgWidth,
            height: svgHeight,
            pointerEvents: 'none',
            zIndex: 0,
          }}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          <defs>
            <marker
              id="arrow-default"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#9CA3AF" />
            </marker>
            <marker
              id="arrow-critical"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#EF4444" />
            </marker>
          </defs>
          {edges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.fromTaskId);
            const toNode = nodeMap.get(edge.toTaskId);
            if (!fromNode || !toNode) return null;

            const start = getNodeRight(fromNode);
            const end = getNodeLeft(toNode);
            const midX = (start.x + end.x) / 2;

            return (
              <path
                key={`edge-${i}`}
                d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
                fill="none"
                stroke={edge.isCriticalPath ? '#EF4444' : '#9CA3AF'}
                strokeWidth={edge.isCriticalPath ? 2.5 : 1.5}
                strokeDasharray={edge.isCriticalPath ? undefined : '5 3'}
                markerEnd={edge.isCriticalPath ? 'url(#arrow-critical)' : 'url(#arrow-default)'}
                opacity={0.85}
              />
            );
          })}
        </svg>

        {/* Node cards rendered as absolutely positioned divs */}
        <div
          style={{
            position: 'relative',
            width: svgWidth,
            height: svgHeight,
            zIndex: 1,
          }}
        >
          {nodes.map((node) => {
            const { task, isCriticalPath, isBlocked, entityColorIndex } = node;
            const center = getNodeCenter(node);
            const left = center.x - CARD_W / 2;
            const top = center.y - CARD_H / 2;

            const entityBorder = ENTITY_BORDER_COLORS[entityColorIndex];
            const priorityWidth = PRIORITY_BORDER_WIDTH[task.priority] ?? 'border';
            const priorityStyle = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.P2;
            const statusStyle = STATUS_COLORS[task.status] ?? STATUS_COLORS.TODO;

            let borderClass = `${priorityWidth} ${entityBorder}`;
            let extraClass = '';
            if (isCriticalPath) {
              borderClass = `${priorityWidth} border-red-500 ring-2 ring-red-200`;
            }
            if (isBlocked) {
              extraClass = 'shadow-amber-200 shadow-md';
              if (!isCriticalPath) {
                borderClass = `${priorityWidth} border-amber-400`;
              }
            }

            const dueDateStr = task.dueDate
              ? new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : null;

            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className={`absolute w-48 p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow duration-150 select-none ${borderClass} ${extraClass}`}
                style={{
                  left,
                  top,
                  height: CARD_H,
                  boxSizing: 'border-box',
                }}
                title={task.title}
              >
                {/* Title */}
                <p className="text-sm font-medium text-gray-800 leading-tight truncate mb-1.5">
                  {task.title}
                </p>

                {/* Badges row */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${priorityStyle.bg} ${priorityStyle.text}`}
                  >
                    {task.priority}
                  </span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] leading-none ${statusStyle.bg} ${statusStyle.text}`}
                  >
                    {task.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Due date + entity color chip */}
                <div className="flex items-center justify-between mt-1.5">
                  {dueDateStr ? (
                    <span className="text-[10px] text-gray-400">{dueDateStr}</span>
                  ) : (
                    <span className="text-[10px] text-gray-300 italic">no due date</span>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${ENTITY_BORDER_COLORS[entityColorIndex].replace('border-', 'bg-')}`}
                  />
                </div>

                {/* Blocked indicator */}
                {isBlocked && (
                  <div className="absolute top-1.5 right-1.5">
                    <span className="text-amber-500 text-xs leading-none" title="Blocked">&#9888;</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
