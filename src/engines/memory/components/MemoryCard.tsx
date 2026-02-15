'use client';

import { useState } from 'react';
import type { MemoryEntry, MemoryType } from '@/shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MemoryCardProps {
  entry: MemoryEntry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TYPE_BADGE_STYLES: Record<MemoryType, string> = {
  SHORT_TERM: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  WORKING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  LONG_TERM: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  EPISODIC: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

const TYPE_LABELS: Record<MemoryType, string> = {
  SHORT_TERM: 'Short-term',
  WORKING: 'Working',
  LONG_TERM: 'Long-term',
  EPISODIC: 'Episodic',
};

function strengthBarColor(strength: number): string {
  if (strength >= 0.7) return 'bg-green-500';
  if (strength >= 0.4) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MemoryCard({ entry }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const truncatedContent =
    entry.content.length > 180 ? `${entry.content.slice(0, 180)}...` : entry.content;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header row: type badge + last accessed */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE_STYLES[entry.type]}`}
        >
          {TYPE_LABELS[entry.type]}
        </span>

        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Last accessed {formatDate(entry.lastAccessed)}
        </span>
      </div>

      {/* Content */}
      <p className="mb-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
        {expanded ? entry.content : truncatedContent}
        {entry.content.length > 180 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="ml-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </p>

      {/* Context */}
      {entry.context && (
        <p className="mb-3 text-xs italic text-zinc-500 dark:text-zinc-400">
          Context: {entry.context}
        </p>
      )}

      {/* Strength bar */}
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Strength</span>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {Math.round(entry.strength * 100)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={`h-full rounded-full transition-all ${strengthBarColor(entry.strength)}`}
            style={{ width: `${entry.strength * 100}%` }}
          />
        </div>
      </div>

      {/* Footer: created date */}
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        Created {formatDate(entry.createdAt)}
      </p>
    </div>
  );
}
