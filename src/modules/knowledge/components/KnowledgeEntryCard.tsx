'use client';

import type { CapturedEntry } from '@/modules/knowledge/types';

interface KnowledgeEntryCardProps {
  entry: CapturedEntry;
  onClick?: (entry: CapturedEntry) => void;
}

export default function KnowledgeEntryCard({ entry, onClick }: KnowledgeEntryCardProps) {
  return (
    <div
      onClick={() => onClick?.(entry)}
      className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded">
          {entry.type}
        </span>
        <span className="text-xs text-gray-500">
          {new Date(entry.createdAt).toLocaleDateString()}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate">{entry.title}</h3>
      <p className="text-sm text-gray-600 line-clamp-2">{entry.content}</p>
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {tag}
            </span>
          ))}
          {entry.tags.length > 5 && (
            <span className="text-xs text-gray-400">+{entry.tags.length - 5}</span>
          )}
        </div>
      )}
    </div>
  );
}
