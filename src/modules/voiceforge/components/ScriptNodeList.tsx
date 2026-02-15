'use client';

import type { ScriptNode } from '@/modules/voiceforge/types';

const NODE_TYPE_STYLES: Record<string, string> = {
  SPEAK: 'bg-blue-100 text-blue-800',
  LISTEN: 'bg-green-100 text-green-800',
  BRANCH: 'bg-yellow-100 text-yellow-800',
  TRANSFER: 'bg-purple-100 text-purple-800',
  END: 'bg-red-100 text-red-800',
  COLLECT_INFO: 'bg-orange-100 text-orange-800',
};

interface ScriptNodeListProps {
  nodes: ScriptNode[];
  startNodeId: string;
  onSelectNode?: (nodeId: string) => void;
}

export function ScriptNodeList({ nodes, startNodeId, onSelectNode }: ScriptNodeListProps) {
  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div
          key={node.id}
          onClick={() => onSelectNode?.(node.id)}
          className={`rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-shadow ${
            node.id === startNodeId ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${NODE_TYPE_STYLES[node.type] ?? ''}`}>
              {node.type}
            </span>
            <span className="text-xs text-gray-400">{node.id}</span>
            {node.id === startNodeId && (
              <span className="text-xs text-indigo-600 font-medium">START</span>
            )}
            {node.escalationTrigger && (
              <span className="text-xs text-red-600 font-medium">ESCALATION</span>
            )}
          </div>
          <p className="text-sm text-gray-700 truncate">{node.content}</p>
          {node.branches.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {node.branches.map((b, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {b.label} → {b.targetNodeId}
                </span>
              ))}
            </div>
          )}
          {node.nextNodeId && (
            <p className="text-xs text-gray-400 mt-1">Next → {node.nextNodeId}</p>
          )}
        </div>
      ))}
    </div>
  );
}
