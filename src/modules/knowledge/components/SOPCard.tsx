'use client';

import type { SOP } from '@/modules/knowledge/types';

interface SOPCardProps {
  sop: SOP;
  onClick?: (sop: SOP) => void;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-600',
};

export default function SOPCard({ sop, onClick }: SOPCardProps) {
  return (
    <div
      onClick={() => onClick?.(sop)}
      className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{sop.title}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[sop.status] || 'bg-gray-100'}`}>
          {sop.status}
        </span>
      </div>
      <p className="text-sm text-gray-600 line-clamp-2 mb-2">{sop.description}</p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{sop.steps.length} steps</span>
        <span>v{sop.version}</span>
        <span>Used {sop.useCount}x</span>
      </div>
    </div>
  );
}
