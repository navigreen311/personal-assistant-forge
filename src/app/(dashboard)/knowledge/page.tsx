'use client';

import { useState, useEffect, useCallback } from 'react';
import QuickCaptureBar from '@/modules/knowledge/components/QuickCaptureBar';
import KnowledgeEntryCard from '@/modules/knowledge/components/KnowledgeEntryCard';
import SearchBar from '@/modules/knowledge/components/SearchBar';
import SearchResultItem from '@/modules/knowledge/components/SearchResultItem';
import TagCloud from '@/modules/knowledge/components/TagCloud';
import SurfacedSuggestion from '@/modules/knowledge/components/SurfacedSuggestion';
import type { CapturedEntry, SearchResult, SurfacedKnowledge, CaptureType } from '@/modules/knowledge/types';

const ENTITY_ID = 'default-entity';

export default function KnowledgeHubPage() {
  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [surfaced, setSurfaced] = useState<SurfacedKnowledge[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);

  const loadEntries = useCallback(async () => {
    const res = await fetch(`/api/knowledge?entityId=${ENTITY_ID}&pageSize=20`);
    const data = await res.json();
    if (data.success) {
      setEntries(data.data);
      // Build tag frequency
      const freq = new Map<string, number>();
      for (const entry of data.data) {
        for (const tag of entry.tags) {
          freq.set(tag, (freq.get(tag) || 0) + 1);
        }
      }
      setTags(
        Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([tag, count]) => ({ tag, count }))
      );
    }
  }, []);

  const loadSurfaced = useCallback(async () => {
    const res = await fetch('/api/knowledge/surface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: ENTITY_ID, currentActivity: 'browsing knowledge hub' }),
    });
    const data = await res.json();
    if (data.success) setSurfaced(data.data);
  }, []);

  useEffect(() => {
    loadEntries();
    loadSurfaced();
  }, [loadEntries, loadSurfaced]);

  async function handleSearch(query: string, filters: { types?: CaptureType[]; tags?: string[] }) {
    if (!query.trim() && !filters.types?.length && !filters.tags?.length) {
      setSearchResults(null);
      return;
    }
    const params = new URLSearchParams({ entityId: ENTITY_ID, query });
    if (filters.types?.length) params.set('types', filters.types.join(','));
    if (filters.tags?.length) params.set('tags', filters.tags.join(','));
    const res = await fetch(`/api/knowledge/search?${params}`);
    const data = await res.json();
    if (data.success) setSearchResults(data.data.results);
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Knowledge Hub</h1>

      <QuickCaptureBar entityId={ENTITY_ID} onCaptured={loadEntries} />

      <SearchBar onSearch={handleSearch} />

      {searchResults ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Search Results ({searchResults.length})</h2>
            <button
              onClick={() => setSearchResults(null)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-sm text-gray-500">No results found</p>
          ) : (
            searchResults.map((result) => (
              <SearchResultItem key={result.entry.id} result={result} />
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Recent Entries</h2>
            {entries.length === 0 ? (
              <p className="text-sm text-gray-500">No entries yet. Capture something above!</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {entries.map((entry) => (
                  <KnowledgeEntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {surfaced.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Surfaced for You</h2>
                <div className="space-y-2">
                  {surfaced.map((s) => (
                    <SurfacedSuggestion key={s.entry.id} suggestion={s} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Tag Cloud</h2>
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <TagCloud tags={tags} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
