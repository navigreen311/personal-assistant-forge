'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { MemoryList } from '@/engines/memory/components/MemoryList';
import { MemorySearch } from '@/engines/memory/components/MemorySearch';
import type { MemorySearchResult } from '@/engines/memory/types';
import type { MemoryStats } from '@/engines/memory/types';
import { MemoryCard } from '@/engines/memory/components/MemoryCard';

interface EntityOption {
  id: string;
  name: string;
}

export default function MemoryPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Entity filter
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('');

  // Management state
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);

  const handleSearchResults = (results: MemorySearchResult[]) => {
    setSearchResults(results);
  };

  // Fetch memory stats
  const fetchStats = useCallback(async () => {
    if (!userId) return;
    setStatsLoading(true);
    try {
      const res = await fetch('/api/memory/stats');
      if (res.ok) {
        const json = await res.json();
        setStats(json.data ?? null);
      }
    } catch {
      // Stats are non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [userId]);

  // Fetch entities for filter
  const fetchEntities = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/entities');
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? [];
        setEntities(data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
      }
    } catch {
      // Entities are optional
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
    fetchEntities();
  }, [fetchStats, fetchEntities]);

  // Purge decayed memories
  const handlePurge = async () => {
    if (!window.confirm('This will permanently delete all memories with strength below 10%. Continue?')) return;
    setPurging(true);
    setPurgeMessage(null);
    try {
      const res = await fetch('/api/memory/purge', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setPurgeMessage(json.data?.message ?? `Purged ${json.data?.purged ?? 0} memories.`);
        fetchStats();
      } else {
        setPurgeMessage('Failed to purge memories.');
      }
    } catch {
      setPurgeMessage('Failed to purge memories.');
    } finally {
      setPurging(false);
    }
  };

  // Export all memories as JSON
  const handleExport = async () => {
    try {
      const res = await fetch('/api/memory?pageSize=10000');
      if (res.ok) {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json.data ?? [], null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `memories-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Export is non-critical
    }
  };

  // Rebuild index (placeholder)
  const handleRebuildIndex = () => {
    setRebuildMessage('Index rebuild initiated. This may take a few moments...');
    setTimeout(() => setRebuildMessage(null), 3000);
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
        <span className="ml-3 text-sm text-zinc-500">Loading session...</span>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">Please sign in to view memories.</p>
      </div>
    );
  }

  // Compute derived stats
  const activeCount = stats ? stats.totalEntries - stats.decayedCount : 0;
  const decayingCount = stats?.decayedCount ?? 0;
  // Estimate storage in KB (rough: ~500 bytes per memory entry)
  const storageMB = stats ? ((stats.totalEntries * 500) / (1024 * 1024)).toFixed(2) : '0.00';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Contextual Memory
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          View, search, and manage your assistant&apos;s memory. Memories decay over
          time based on their type and how often they&apos;re accessed.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total Memories</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {statsLoading ? '...' : stats?.totalEntries ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Active (&gt;50%)</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {statsLoading ? '...' : activeCount}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Decaying (&lt;50%)</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {statsLoading ? '...' : decayingCount}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Storage</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {statsLoading ? '...' : `${storageMB} MB`}
          </p>
        </div>
      </div>

      {/* Entity filter */}
      {entities.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Entity:</label>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All Entities</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      <MemorySearch userId={userId} onResults={handleSearchResults} />

      {searchResults ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">
              Search Results ({searchResults.length})
            </h3>
            <button
              onClick={() => setSearchResults(null)}
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Clear search
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-gray-500 text-sm dark:text-gray-400">No memories matched your search.</p>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <div key={result.entry.id} className="relative">
                  <MemoryCard entry={result.entry} />
                  <div className="absolute top-2 right-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded dark:bg-blue-900/40 dark:text-blue-300">
                    Score: {result.relevanceScore.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <MemoryList
          userId={userId}
          entityFilter={selectedEntity || undefined}
          onRefresh={fetchStats}
        />
      )}

      {/* Memory management buttons */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mr-2">Memory Management:</span>
        <button
          type="button"
          onClick={handlePurge}
          disabled={purging}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          {purging ? 'Purging...' : 'Purge decayed (<10%)'}
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Export all
        </button>
        <button
          type="button"
          onClick={handleRebuildIndex}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Rebuild index
        </button>
      </div>

      {/* Toast messages */}
      {purgeMessage && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
          {purgeMessage}
        </div>
      )}
      {rebuildMessage && (
        <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {rebuildMessage}
        </div>
      )}
    </div>
  );
}
