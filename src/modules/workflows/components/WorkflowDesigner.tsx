'use client';

import React, { useState, useCallback, useRef } from 'react';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, WorkflowNodeConfig, TriggerNodeConfig } from '@/modules/workflows/types';

// ============================================================================
// Visual Workflow Designer
// HTML5 drag-and-drop canvas with SVG edges and Tailwind styling
// ============================================================================

interface WorkflowDesignerProps {
  graph: WorkflowGraph;
  onChange: (graph: WorkflowGraph) => void;
  onNodeSelect: (node: WorkflowNode | null) => void;
  selectedNodeId: string | null;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

const NODE_TYPE_COLORS: Record<string, string> = {
  TRIGGER: 'bg-green-100 border-green-500',
  ACTION: 'bg-blue-100 border-blue-500',
  CONDITION: 'bg-yellow-100 border-yellow-500',
  AI_DECISION: 'bg-purple-100 border-purple-500',
  HUMAN_APPROVAL: 'bg-orange-100 border-orange-500',
  DELAY: 'bg-gray-100 border-gray-500',
  LOOP: 'bg-cyan-100 border-cyan-500',
  ERROR_HANDLER: 'bg-red-100 border-red-500',
  SUB_WORKFLOW: 'bg-indigo-100 border-indigo-500',
};

const NODE_TYPE_ICONS: Record<string, string> = {
  TRIGGER: '\u26A1',
  ACTION: '\u25B6',
  CONDITION: '\u2B29',
  AI_DECISION: '\uD83E\uDDE0',
  HUMAN_APPROVAL: '\u2714',
  DELAY: '\u23F1',
  LOOP: '\uD83D\uDD01',
  ERROR_HANDLER: '\u26A0',
  SUB_WORKFLOW: '\uD83D\uDD17',
};

export default function WorkflowDesigner({
  graph,
  onChange,
  onNodeSelect,
  selectedNodeId,
}: WorkflowDesignerProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      setDragState({
        nodeId,
        offsetX: e.clientX / zoom - node.position.x,
        offsetY: e.clientY / zoom - node.position.y,
      });
    },
    [graph.nodes, zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;

      const newX = e.clientX / zoom - dragState.offsetX;
      const newY = e.clientY / zoom - dragState.offsetY;

      const updatedNodes = graph.nodes.map((n) =>
        n.id === dragState.nodeId
          ? { ...n, position: { x: Math.max(0, newX), y: Math.max(0, newY) } }
          : n
      );

      onChange({ ...graph, nodes: updatedNodes });
    },
    [dragState, graph, onChange, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) onNodeSelect(node);
    },
    [graph.nodes, onNodeSelect]
  );

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      if (connecting) {
        // Complete connection
        if (connecting !== nodeId) {
          const newEdge: WorkflowEdge = {
            id: `edge-${Date.now()}`,
            sourceNodeId: connecting,
            targetNodeId: nodeId,
          };
          onChange({ ...graph, edges: [...graph.edges, newEdge] });
        }
        setConnecting(null);
      } else {
        onNodeSelect(graph.nodes.find((n) => n.id === nodeId) ?? null);
      }
    },
    [connecting, graph, onChange, onNodeSelect]
  );

  const handleCanvasClick = useCallback(() => {
    onNodeSelect(null);
    setConnecting(null);
  }, [onNodeSelect]);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const updatedNodes = graph.nodes.filter((n) => n.id !== nodeId);
      const updatedEdges = graph.edges.filter(
        (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
      );
      onChange({ nodes: updatedNodes, edges: updatedEdges });
      onNodeSelect(null);
    },
    [graph, onChange, onNodeSelect]
  );

  const handleStartConnect = useCallback((nodeId: string) => {
    setConnecting(nodeId);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.1, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.1, 0.3));
  }, []);

  const handleFitView = useCallback(() => {
    setZoom(1);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('nodeType');
      if (!nodeType) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;

      const defaultConfig = getDefaultConfig(nodeType);
      const newNode: WorkflowNode = {
        id: `node-${Date.now()}`,
        type: nodeType as WorkflowNode['type'],
        label: `New ${nodeType.replace('_', ' ')}`,
        config: defaultConfig,
        position: { x, y },
        inputs: [],
        outputs: [],
      };

      onChange({ ...graph, nodes: [...graph.nodes, newNode] });
    },
    [graph, onChange, zoom]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="relative w-full h-full bg-gray-50 overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2 bg-white rounded-lg shadow-md p-2">
        <button
          onClick={handleZoomIn}
          className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          title="Zoom Out"
        >
          -
        </button>
        <button
          onClick={handleFitView}
          className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          title="Fit View"
        >
          Fit
        </button>
        {selectedNodeId && (
          <>
            <div className="w-px bg-gray-300" />
            <button
              onClick={() => handleStartConnect(selectedNodeId)}
              className="px-2 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded text-blue-700"
              title="Connect to another node"
            >
              Connect
            </button>
            <button
              onClick={() => handleDeleteNode(selectedNodeId)}
              className="px-2 py-1 text-sm bg-red-100 hover:bg-red-200 rounded text-red-700"
              title="Delete node"
            >
              Delete
            </button>
          </>
        )}
        {connecting && (
          <span className="px-2 py-1 text-sm text-blue-600 animate-pulse">
            Click a target node...
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full cursor-grab"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
      >
        {/* SVG Edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {graph.edges.map((edge) => {
            const source = graph.nodes.find((n) => n.id === edge.sourceNodeId);
            const target = graph.nodes.find((n) => n.id === edge.targetNodeId);
            if (!source || !target) return null;

            const sx = source.position.x + NODE_WIDTH;
            const sy = source.position.y + NODE_HEIGHT / 2;
            const tx = target.position.x;
            const ty = target.position.y + NODE_HEIGHT / 2;
            const cx = (sx + tx) / 2;

            return (
              <g key={edge.id}>
                <path
                  d={`M ${sx} ${sy} C ${cx} ${sy}, ${cx} ${ty}, ${tx} ${ty}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
                {edge.label && (
                  <text
                    x={cx}
                    y={(sy + ty) / 2 - 8}
                    textAnchor="middle"
                    className="text-xs fill-gray-500"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        {/* Nodes */}
        {graph.nodes.map((node) => (
          <div
            key={node.id}
            className={`absolute rounded-lg border-2 shadow-sm cursor-pointer select-none transition-shadow ${
              NODE_TYPE_COLORS[node.type] ?? 'bg-gray-100 border-gray-400'
            } ${selectedNodeId === node.id ? 'ring-2 ring-blue-400 shadow-lg' : 'hover:shadow-md'}`}
            style={{
              left: node.position.x,
              top: node.position.y,
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
            }}
            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
            onClick={(e) => handleNodeClick(e, node.id)}
            onDoubleClick={() => handleNodeDoubleClick(node.id)}
          >
            <div className="flex items-center gap-2 p-2 h-full">
              <span className="text-xl">{NODE_TYPE_ICONS[node.type] ?? '\u2B1B'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{node.label}</div>
                <div className="text-xs text-gray-500 truncate">
                  {node.type.replace('_', ' ')}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getDefaultConfig(nodeType: string): WorkflowNodeConfig {
  switch (nodeType) {
    case 'TRIGGER':
      return { nodeType: 'TRIGGER', triggerType: 'MANUAL' } as TriggerNodeConfig;
    case 'ACTION':
      return { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: {} } as WorkflowNodeConfig;
    case 'CONDITION':
      return { nodeType: 'CONDITION', expression: '', trueOutputId: '', falseOutputId: '' } as WorkflowNodeConfig;
    case 'AI_DECISION':
      return { nodeType: 'AI_DECISION', decisionType: 'CLASSIFY', prompt: '', outputMapping: {} } as WorkflowNodeConfig;
    case 'HUMAN_APPROVAL':
      return { nodeType: 'HUMAN_APPROVAL', approverIds: [], message: '', timeoutHours: 24, requiredApprovals: 1 } as WorkflowNodeConfig;
    case 'DELAY':
      return { nodeType: 'DELAY', delayType: 'FIXED', delayMs: 60000 } as WorkflowNodeConfig;
    case 'LOOP':
      return { nodeType: 'LOOP', collection: '', iteratorVariable: 'item', bodyNodeIds: [], maxIterations: 100 } as WorkflowNodeConfig;
    case 'ERROR_HANDLER':
      return { nodeType: 'ERROR_HANDLER', errorTypes: ['*'], notifyOnError: true } as WorkflowNodeConfig;
    case 'SUB_WORKFLOW':
      return { nodeType: 'SUB_WORKFLOW', workflowId: '', inputMapping: {}, outputMapping: {} } as WorkflowNodeConfig;
    default:
      return { nodeType: 'TRIGGER', triggerType: 'MANUAL' } as TriggerNodeConfig;
  }
}
