'use client';

import type { GraphNode, GraphEdge } from '@/modules/knowledge/types';

interface GraphNodeDetailProps {
  node: GraphNode;
  edges: GraphEdge[];
  onClose: () => void;
}

export default function GraphNodeDetail({ node, edges, onClose }: GraphNodeDetailProps) {
  const connectedEdges = edges.filter(
    (e) => e.sourceId === node.id || e.targetId === node.id
  );

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{node.label}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg"
        >
          &times;
        </button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Type</span>
          <span className="font-medium">{node.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Connections</span>
          <span className="font-medium">{node.connectionCount}</span>
        </div>
        {connectedEdges.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <p className="text-xs font-medium text-gray-700 mb-1">Relationships</p>
            {connectedEdges.slice(0, 10).map((edge, i) => (
              <div key={i} className="text-xs text-gray-600 py-0.5">
                {edge.relationship} (strength: {Math.round(edge.strength * 100)}%)
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
