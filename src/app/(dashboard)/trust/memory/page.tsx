'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { MemoryList } from '@/engines/memory/components/MemoryList';
import { MemorySearch } from '@/engines/memory/components/MemorySearch';
import type { MemorySearchResult } from '@/engines/memory/types';
import { MemoryCard } from '@/engines/memory/components/MemoryCard';

export default function MemoryPage() {
  const { data: session, status } = useSession();
  const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null);

  const userId = session?.user?.id ?? '';

  const handleSearchResults = (results: MemorySearchResult[]) => {
    setSearchResults(results);
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading...
        </span>
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-900/50 dark:bg-yellow-900/20">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
          Please sign in to view memory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Contextual Memory
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          View, search, and manage your assistant&apos;s memory. Memories decay over
          time based on their type and how often they&apos;re accessed.
        </p>
      </div>

      <MemorySearch userId={userId} onResults={handleSearchResults} />

      {searchResults ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-medium text-zinc-700 dark:text-zinc-300">
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
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No memories matched your search.</p>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <div key={result.entry.id} className="relative">
                  <MemoryCard entry={result.entry} />
                  <div className="absolute top-2 right-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded dark:bg-blue-900/30 dark:text-blue-400">
                    Score: {result.relevanceScore.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <MemoryList userId={userId} />
      )}
    </div>
  );
}
