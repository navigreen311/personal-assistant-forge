'use client';

import type { GraphCluster } from '@/modules/knowledge/types';

interface ClusterListProps {
  clusters: GraphCluster[];
  onClusterClick?: (cluster: GraphCluster) => void;
}

export default function ClusterList({ clusters, onClusterClick }: ClusterListProps) {
  if (clusters.length === 0) {
    return <p className="text-sm text-gray-500 p-3">No clusters detected</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 px-3">Clusters</h3>
      {clusters.map((cluster) => (
        <div
          key={cluster.id}
          onClick={() => onClusterClick?.(cluster)}
          className="p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
        >
          <p className="text-sm font-medium text-gray-900">{cluster.label}</p>
          <p className="text-xs text-gray-500">{cluster.nodeIds.length} nodes</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {cluster.dominantTags.map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
