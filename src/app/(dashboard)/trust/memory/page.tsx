'use client';

import { useState } from 'react';
import { MemoryList } from '@/engines/memory/components/MemoryList';
import { MemorySearch } from '@/engines/memory/components/MemorySearch';
import type { MemorySearchResult } from '@/engines/memory/types';
import { MemoryCard } from '@/engines/memory/components/MemoryCard';

const DEMO_USER_ID = 'demo-user';

export default function MemoryPage() {
  const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null);

  const handleSearchResults = (results: MemorySearchResult[]) => {
    setSearchResults(results);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Contextual Memory
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          View, search, and manage your assistant&apos;s memory. Memories decay over
          time based on their type and how often they&apos;re accessed.
        </p>
      </div>

      <MemorySearch userId={DEMO_USER_ID} onResults={handleSearchResults} />

      {searchResults ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-medium text-gray-700">
              Search Results ({searchResults.length})
            </h3>
            <button
              onClick={() => setSearchResults(null)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear search
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-gray-500 text-sm">No memories matched your search.</p>
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <div key={result.entry.id} className="relative">
                  <MemoryCard entry={result.entry} />
                  <div className="absolute top-2 right-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                    Score: {result.relevanceScore.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <MemoryList userId={DEMO_USER_ID} />
      )}
    </div>
  );
}
