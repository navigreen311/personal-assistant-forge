'use client';

import type { MemoryStats as MemoryStatsType } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MemoryStatsProps {
  stats: MemoryStatsType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SHORT_TERM: { label: 'Short-term', color: 'bg-amber-500' },
  WORKING: { label: 'Working', color: 'bg-blue-500' },
  LONG_TERM: { label: 'Long-term', color: 'bg-emerald-500' },
  EPISODIC: { label: 'Episodic', color: 'bg-purple-500' },
};

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function strengthColor(avg: number): string {
  if (avg >= 0.7) return 'text-green-600 dark:text-green-400';
  if (avg >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MemoryStats({ stats }: MemoryStatsProps) {
  const typeEntries = Object.entries(stats.byType) as [string, number][];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Memory Statistics
      </h3>

      {/* Top-level metrics grid */}
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Total entries */}
        <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Entries</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {stats.totalEntries}
          </p>
        </div>

        {/* Average strength */}
        <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Avg Strength</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${strengthColor(stats.averageStrength)}`}>
            {Math.round(stats.averageStrength * 100)}%
          </p>
        </div>

        {/* Decayed */}
        <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Decayed</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {stats.decayedCount}
          </p>
          {stats.totalEntries > 0 && (
            <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              {Math.round((stats.decayedCount / stats.totalEntries) * 100)}% of total
            </p>
          )}
        </div>

        {/* Date range */}
        <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Date Range</p>
          <p className="mt-1 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
            {formatDate(stats.oldestEntry)}
          </p>
          <p className="text-xs leading-5 text-zinc-700 dark:text-zinc-300">
            to {formatDate(stats.newestEntry)}
          </p>
        </div>
      </div>

      {/* Breakdown by type */}
      <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Breakdown by Type
      </h4>
      <div className="space-y-2">
        {typeEntries.map(([key, count]) => {
          const meta = TYPE_LABELS[key] ?? { label: key, color: 'bg-zinc-500' };
          const pct = stats.totalEntries > 0 ? (count / stats.totalEntries) * 100 : 0;

          return (
            <div key={key}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{meta.label}</span>
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {count} ({Math.round(pct)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className={`h-full rounded-full transition-all ${meta.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
