'use client';

import type { SearchResult } from '@/modules/knowledge/types';

interface SearchResultItemProps {
  result: SearchResult;
  onClick?: (result: SearchResult) => void;
}

export default function SearchResultItem({ result, onClick }: SearchResultItemProps) {
  const scorePercent = Math.round(result.relevanceScore * 100);

  return (
    <div
      onClick={() => onClick?.(result)}
      className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900 truncate">{result.entry.title}</h4>
        <span className="text-xs text-gray-500 ml-2 shrink-0">{scorePercent}% match</span>
      </div>
      <p className="text-sm text-gray-600 mb-2">{result.highlightedExcerpt}</p>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{result.entry.type}</span>
        {result.matchedFields.map((field) => (
          <span key={field} className="px-2 py-0.5 bg-green-50 text-green-600 rounded">
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}
