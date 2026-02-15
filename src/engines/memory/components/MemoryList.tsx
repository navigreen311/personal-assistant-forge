'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MemoryEntry, MemoryType } from '@/shared/types';
import { MemoryCard } from './MemoryCard';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MemoryListProps {
  userId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 10;

const TABS: { value: MemoryType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'SHORT_TERM', label: 'Short-term' },
  { value: 'WORKING', label: 'Working' },
  { value: 'LONG_TERM', label: 'Long-term' },
  { value: 'EPISODIC', label: 'Episodic' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MemoryList({ userId }: MemoryListProps) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<MemoryType | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        userId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (activeTab !== 'ALL') {
        params.set('type', activeTab);
      }

      const res = await fetch(`/api/memory?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Failed to fetch memories (${res.status})`);
      }

      const json = (await res.json()) as {
        data: MemoryEntry[];
        meta?: { total?: number };
      };

      setEntries(json.data ?? []);
      setTotal(json.meta?.total ?? json.data?.length ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [userId, activeTab, page]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Reset to page 1 when switching tabs
  const handleTabChange = useCallback((tab: MemoryType | 'ALL') => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabChange(tab.value)}
            className={`flex-shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
          <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">Loading memories...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-md bg-red-50 px-4 py-3 dark:bg-red-900/30">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            type="button"
            onClick={fetchEntries}
            className="mt-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No memories found{activeTab !== 'ALL' ? ` for type "${activeTab.replace('_', ' ').toLowerCase()}"` : ''}.
          </p>
        </div>
      )}

      {/* Entry list */}
      {!loading && !error && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <MemoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Page {page} of {totalPages} ({total} total)
          </p>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
