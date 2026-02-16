'use client';

import { useState } from 'react';
import type { KnowledgeGraph, GraphNode } from '@/modules/knowledge/types';

interface GraphCanvasProps {
  graph: KnowledgeGraph;
  onNodeClick?: (node: GraphNode) => void;
}

export default function GraphCanvas({ graph, onNodeClick }: GraphCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  function handleNodeClick(node: GraphNode) {
    setSelectedNodeId(node.id);
    onNodeClick?.(node);
  }

  const nodeColors: Record<string, string> = {
    KNOWLEDGE: 'bg-blue-500',
    TAG: 'bg-green-500',
    CONTACT: 'bg-purple-500',
    TASK: 'bg-yellow-500',
    PROJECT: 'bg-red-500',
    DOCUMENT: 'bg-indigo-500',
  };

  // Simple grid layout for graph visualization
  const cols = Math.max(4, Math.ceil(Math.sqrt(graph.nodes.length)));

  return (
    <div className="relative bg-gray-50 rounded-lg p-4 min-h-[400px] overflow-auto">
      {graph.nodes.length === 0 ? (
        <p className="text-center text-gray-500 mt-20">No nodes to display</p>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(100px, 1fr))` }}
        >
          {graph.nodes.map((node) => (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node)}
              className={`p-3 rounded-lg text-center cursor-pointer transition-all border-2 ${
                selectedNodeId === node.id
                  ? 'border-blue-600 shadow-lg'
                  : 'border-transparent hover:border-gray-300'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full mx-auto mb-1 ${nodeColors[node.type] || 'bg-gray-500'}`}
              />
              <p className="text-xs font-medium text-gray-900 truncate">{node.label}</p>
              <p className="text-xs text-gray-500">{node.connectionCount} links</p>
            </div>
          ))}
        </div>
      )}
      {/* Edge indicators (simplified: show connected pairs) */}
      <div className="mt-4 border-t pt-3">
        <p className="text-xs text-gray-500 mb-2">
          {graph.edges.length} connections between {graph.nodes.length} nodes
        </p>
      </div>
    </div>
  );
}
