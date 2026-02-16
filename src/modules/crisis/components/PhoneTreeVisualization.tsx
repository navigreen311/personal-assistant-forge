'use client';

import type { PhoneTreeNode } from '../types';

function TreeNode({ node, depth = 0 }: { node: PhoneTreeNode; depth?: number }) {
  return (
    <div className={`${depth > 0 ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''}`}>
      <div className="flex items-center gap-3 py-2">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">
          {node.order}
        </div>
        <div>
          <div className="font-medium text-sm">{node.contactName}</div>
          <div className="text-xs text-gray-500">{node.role} | {node.phone}</div>
        </div>
      </div>
      {node.children.map(child => (
        <TreeNode key={child.contactId} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function PhoneTreeVisualization({ tree }: { tree: PhoneTreeNode[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Phone Tree</h3>
      {tree.map(node => (
        <TreeNode key={node.contactId} node={node} />
      ))}
    </div>
  );
}
