'use client';

import { useState, useCallback } from 'react';
import type { MemoryType } from '@/shared/types';
import type { MemorySearchResult } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MemorySearchProps {
  userId: string;
  onResults: (results: MemorySearchResult[]) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MEMORY_TYPES: { value: MemoryType; label: string }[] = [
  { value: 'SHORT_TERM', label: 'Short-term' },
  { value: 'WORKING', label: 'Working' },
  { value: 'LONG_TERM', label: 'Long-term' },
  { value: 'EPISODIC', label: 'Episodic' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MemorySearch({ userId, onResults }: MemorySearchProps) {
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<MemoryType>>(new Set());
  const [minStrength, setMinStrength] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleType = useCallback((type: MemoryType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          query: query.trim(),
          types: selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
          minStrength: minStrength > 0 ? minStrength : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Search failed (${res.status})`);
      }

      const { data } = (await res.json()) as { data: MemorySearchResult[] };
      onResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [query, userId, selectedTypes, minStrength, onResults]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Search input */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search memories..."
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Type filter checkboxes */}
      <div className="mb-4">
        <span className="mb-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Filter by type
        </span>
        <div className="flex flex-wrap gap-3">
          {MEMORY_TYPES.map((mt) => (
            <label
              key={mt.value}
              className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <input
                type="checkbox"
                checked={selectedTypes.has(mt.value)}
                onChange={() => toggleType(mt.value)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600"
              />
              {mt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Strength threshold slider */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Minimum strength
          </span>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {Math.round(minStrength * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minStrength}
          onChange={(e) => setMinStrength(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-600 dark:bg-zinc-700"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
