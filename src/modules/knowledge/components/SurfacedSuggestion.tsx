'use client';

import type { SurfacedKnowledge } from '@/modules/knowledge/types';

interface SurfacedSuggestionProps {
  suggestion: SurfacedKnowledge;
  onDismiss?: (entryId: string) => void;
  onClick?: (suggestion: SurfacedKnowledge) => void;
}

export default function SurfacedSuggestion({ suggestion, onDismiss, onClick }: SurfacedSuggestionProps) {
  return (
    <div
      onClick={() => onClick?.(suggestion)}
      className="p-3 bg-amber-50 rounded-lg border border-amber-200 hover:border-amber-300 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">{suggestion.entry.title}</h4>
          <p className="text-xs text-amber-700 mt-0.5">{suggestion.reason}</p>
          <p className="text-xs text-gray-600 mt-1 line-clamp-1">{suggestion.entry.content}</p>
        </div>
        {onDismiss && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(suggestion.entry.id);
            }}
            className="text-gray-400 hover:text-gray-600 ml-2 text-sm"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
