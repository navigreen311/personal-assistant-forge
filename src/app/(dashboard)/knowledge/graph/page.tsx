'use client';

import { useState, useEffect, useCallback } from 'react';
import GraphCanvas from '@/modules/knowledge/components/GraphCanvas';
import GraphNodeDetail from '@/modules/knowledge/components/GraphNodeDetail';
import ClusterList from '@/modules/knowledge/components/ClusterList';
import type { KnowledgeGraph, GraphNode } from '@/modules/knowledge/types';

const ENTITY_ID = 'default-entity';

export default function KnowledgeGraphPage() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/graph?entityId=${ENTITY_ID}`);
      const data = await res.json();
      if (data.success) setGraph(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Knowledge Graph</h1>

      {graph && (
        <div className="flex gap-4 text-sm bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-center">
            <p className="text-xl font-bold text-blue-600">{graph.stats.totalNodes}</p>
            <p className="text-gray-500">Nodes</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-green-600">{graph.stats.totalEdges}</p>
            <p className="text-gray-500">Edges</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-purple-600">{graph.clusters.length}</p>
            <p className="text-gray-500">Clusters</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-red-600">{graph.stats.isolatedNodes}</p>
            <p className="text-gray-500">Isolated</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading graph...</p>
      ) : graph ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <GraphCanvas graph={graph} onNodeClick={setSelectedNode} />
          </div>
          <div className="space-y-4">
            {selectedNode && (
              <GraphNodeDetail
                node={selectedNode}
                edges={graph.edges}
                onClose={() => setSelectedNode(null)}
              />
            )}
            <ClusterList clusters={graph.clusters} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No graph data available</p>
      )}
    </div>
  );
}
