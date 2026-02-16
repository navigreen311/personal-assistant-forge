'use client';

import { useState, useMemo } from 'react';
import type { DependencyGraph, DependencyNode, DependencyEdge } from '../types';

interface DependencyGraphViewProps {
  graph: DependencyGraph;
  onNodeClick: (taskId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  TODO: '#9CA3AF',
  IN_PROGRESS: '#3B82F6',
  BLOCKED: '#EF4444',
  DONE: '#10B981',
  CANCELLED: '#D1D5DB',
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

export default function DependencyGraphView({
  graph,
  onNodeClick,
}: DependencyGraphViewProps) {
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const svgBounds = useMemo(() => {
    if (graph.nodes.length === 0) return { width: 800, height: 400 };
    const maxX = Math.max(...graph.nodes.map((n) => n.position.x)) + NODE_WIDTH + 100;
    const maxY = Math.max(...graph.nodes.map((n) => n.position.y)) + NODE_HEIGHT + 100;
    return { width: Math.max(800, maxX), height: Math.max(400, maxY) };
  }, [graph.nodes]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const getEdgeColor = (edge: DependencyEdge) => {
    const fromNode = graph.nodes.find((n) => n.taskId === edge.fromTaskId);
    if (fromNode?.status === 'DONE') return '#10B981'; // green
    if (fromNode?.status === 'BLOCKED') return '#EF4444'; // red
    return '#9CA3AF'; // gray
  };

  const renderEdge = (edge: DependencyEdge, i: number) => {
    const from = graph.nodes.find((n) => n.taskId === edge.fromTaskId);
    const to = graph.nodes.find((n) => n.taskId === edge.toTaskId);
    if (!from || !to) return null;

    const x1 = from.position.x + NODE_WIDTH;
    const y1 = from.position.y + NODE_HEIGHT / 2;
    const x2 = to.position.x;
    const y2 = to.position.y + NODE_HEIGHT / 2;

    const midX = (x1 + x2) / 2;
    const color = getEdgeColor(edge);
    const isCritical = from.isCriticalPath && to.isCriticalPath;

    return (
      <g key={`edge-${i}`}>
        <path
          d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
          fill="none"
          stroke={color}
          strokeWidth={isCritical ? 3 : 1.5}
          strokeDasharray={isCritical ? undefined : '4 2'}
          markerEnd="url(#arrowhead)"
        />
      </g>
    );
  };

  const renderNode = (node: DependencyNode) => {
    const { position, taskTitle, status, priority, isCriticalPath, isBottleneck } = node;
    const statusColor = STATUS_COLORS[status] ?? '#9CA3AF';

    return (
      <g
        key={node.taskId}
        onClick={() => onNodeClick(node.taskId)}
        className="cursor-pointer"
      >
        <rect
          x={position.x}
          y={position.y}
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          rx={8}
          fill="white"
          stroke={isCriticalPath ? '#F59E0B' : statusColor}
          strokeWidth={isCriticalPath ? 3 : 2}
        />
        {/* Status indicator */}
        <rect
          x={position.x}
          y={position.y}
          width={6}
          height={NODE_HEIGHT}
          rx={8}
          fill={statusColor}
        />
        {/* Title */}
        <text
          x={position.x + 14}
          y={position.y + 20}
          fontSize={11}
          fontWeight={600}
          fill="#1F2937"
        >
          {taskTitle.length > 22 ? taskTitle.slice(0, 22) + '...' : taskTitle}
        </text>
        {/* Priority badge */}
        <rect
          x={position.x + 14}
          y={position.y + 30}
          width={24}
          height={16}
          rx={3}
          fill={priority === 'P0' ? '#FEE2E2' : priority === 'P1' ? '#FEF3C7' : '#DBEAFE'}
        />
        <text
          x={position.x + 18}
          y={position.y + 42}
          fontSize={9}
          fontWeight={700}
          fill={priority === 'P0' ? '#B91C1C' : priority === 'P1' ? '#92400E' : '#1D4ED8'}
        >
          {priority}
        </text>
        {/* Status text */}
        <text
          x={position.x + 44}
          y={position.y + 42}
          fontSize={9}
          fill="#6B7280"
        >
          {status.replace('_', ' ')}
        </text>
        {/* Blocking count */}
        {node.blockingCount > 0 && (
          <>
            <text
              x={position.x + 14}
              y={position.y + 60}
              fontSize={9}
              fill="#6B7280"
            >
              Blocks: {node.blockingCount}
            </text>
          </>
        )}
        {/* Bottleneck warning */}
        {isBottleneck && (
          <text
            x={position.x + NODE_WIDTH - 20}
            y={position.y + 16}
            fontSize={14}
          >
            ⚠
          </text>
        )}
      </g>
    );
  };

  if (graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <p className="text-sm">No dependency graph to display</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
          className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          -
        </button>
        <button
          onClick={() => { setPan({ x: 50, y: 50 }); setZoom(1); }}
          className="px-2 h-8 flex items-center justify-center bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 bg-white border border-gray-200 rounded p-2 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-400" /> Critical Path
        </div>
        <div className="flex items-center gap-2">
          <span>⚠</span> Bottleneck
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        className="overflow-hidden border border-gray-200 rounded-lg bg-gray-50"
        style={{ height: '500px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${svgBounds.width / zoom} ${svgBounds.height / zoom}`}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
            </marker>
          </defs>
          {graph.edges.map(renderEdge)}
          {graph.nodes.map(renderNode)}
        </svg>
      </div>
    </div>
  );
}
