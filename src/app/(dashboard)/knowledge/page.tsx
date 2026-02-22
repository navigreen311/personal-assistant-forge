'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import QuickCaptureBar from '@/modules/knowledge/components/QuickCaptureBar';
import KnowledgeEntryCard from '@/modules/knowledge/components/KnowledgeEntryCard';
import SearchBar from '@/modules/knowledge/components/SearchBar';
import SearchResultItem from '@/modules/knowledge/components/SearchResultItem';
import TagCloud from '@/modules/knowledge/components/TagCloud';
import SurfacedSuggestion from '@/modules/knowledge/components/SurfacedSuggestion';
import type { CapturedEntry, SearchResult, SurfacedKnowledge, CaptureType } from '@/modules/knowledge/types';

// --- Types ---

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  entityId: string;
  entryIds: string[];
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

type TabKey = 'all' | 'notes' | 'links' | 'files' | 'collections';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'links', label: 'Links' },
  { key: 'files', label: 'Files' },
  { key: 'collections', label: 'Collections' },
];

// --- Stat Card Component ---

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// --- Collection Card Component ---

function CollectionCard({ collection }: { collection: KnowledgeCollection }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{'\uD83D\uDCC1'}</span>
        <h3 className="text-sm font-semibold text-gray-900 truncate">{collection.name}</h3>
      </div>
      {collection.description && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{collection.description}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{collection.entryCount} {collection.entryCount === 1 ? 'entry' : 'entries'}</span>
        <span>{new Date(collection.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function KnowledgeHubPage() {
  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [surfaced, setSurfaced] = useState<SurfacedKnowledge[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('default-entity');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showCreateCollection, setShowCreateCollection] = useState(false);

  // --- Load entities ---
  const loadEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities');
      const data = await res.json();
      if (data.success && data.data) {
        const mapped = (data.data as Array<{ id: string; name: string; type: string }>).map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
        }));
        setEntities(mapped);
        if (mapped.length > 0) {
          setSelectedEntityId(mapped[0].id);
        }
      }
    } catch {
      // silently fail, keep default entity
    }
  }, []);

  // --- Load entries ---
  const loadEntries = useCallback(async () => {
    const res = await fetch(`/api/knowledge?entityId=${selectedEntityId}&pageSize=50`);
    const data = await res.json();
    if (data.success) {
      setEntries(data.data);
      // Build tag frequency
      const freq = new Map<string, number>();
      for (const entry of data.data as CapturedEntry[]) {
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
  }, [selectedEntityId]);

  // --- Load surfaced ---
  const loadSurfaced = useCallback(async () => {
    const res = await fetch('/api/knowledge/surface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: selectedEntityId, currentActivity: 'browsing knowledge hub' }),
    });
    const data = await res.json();
    if (data.success) setSurfaced(data.data);
  }, [selectedEntityId]);

  // --- Load collections ---
  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge/collections?entityId=${selectedEntityId}`);
      const data = await res.json();
      if (data.success) {
        setCollections(data.data);
      }
    } catch {
      setCollections([]);
    }
  }, [selectedEntityId]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching data on mount is intentional
    loadEntries();
    loadSurfaced();
    loadCollections();
  }, [loadEntries, loadSurfaced, loadCollections]);

  // --- Stats computed from entries ---
  const stats = useMemo(() => {
    const total = entries.length;
    const notes = entries.filter((e) => e.type === 'NOTE').length;
    const links = entries.filter((e) => e.type === 'BOOKMARK').length;
    const files = entries.filter((e) => e.type !== 'NOTE' && e.type !== 'BOOKMARK').length;
    return { total, notes, links, files };
  }, [entries]);

  // --- Filter entries by tab and active tag ---
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Tab filter
    switch (activeTab) {
      case 'notes':
        result = result.filter((e) => e.type === 'NOTE');
        break;
      case 'links':
        result = result.filter((e) => e.type === 'BOOKMARK');
        break;
      case 'files':
        result = result.filter((e) => e.type === 'ARTICLE' || e.type === 'IMAGE_NOTE');
        break;
      case 'collections':
        // collections tab handled separately
        return [];
      default:
        break;
    }

    // Active tag filter
    if (activeTagFilter) {
      result = result.filter((e) => e.tags.includes(activeTagFilter));
    }

    return result;
  }, [entries, activeTab, activeTagFilter]);

  const availableTagNames = useMemo(() => tags.map((t) => t.tag), [tags]);

  // --- Search handler ---
  async function handleSearch(query: string, filters: {
    types?: CaptureType[];
    tags?: string[];
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: 'recent' | 'most_used';
  }) {
    if (!query.trim() && !filters.types?.length && !filters.tags?.length && !filters.dateFrom) {
      setSearchResults(null);
      return;
    }
    const params = new URLSearchParams({ entityId: selectedEntityId, query });
    if (filters.types?.length) params.set('types', filters.types.join(','));
    if (filters.tags?.length) params.set('tags', filters.tags.join(','));
    if (filters.dateFrom) params.set('startDate', filters.dateFrom);
    if (filters.dateTo) params.set('endDate', filters.dateTo);
    const res = await fetch(`/api/knowledge/search?${params}`);
    const data = await res.json();
    if (data.success) setSearchResults(data.data.results);
  }

  // --- Tag click handler ---
  function handleTagClick(tag: string) {
    setActiveTagFilter((prev) => (prev === tag ? null : tag));
  }

  // --- Delete handler ---
  async function handleDelete(entryId: string) {
    await fetch(`/api/knowledge/${entryId}`, { method: 'DELETE' });
    loadEntries();
  }

  // --- Entity change handler ---
  function handleEntityChange(newEntityId: string) {
    setSelectedEntityId(newEntityId);
  }

  // --- Create collection handler ---
  async function handleCreateCollection() {
    if (!newCollectionName.trim()) return;
    await fetch('/api/knowledge/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityId: selectedEntityId,
        name: newCollectionName,
      }),
    });
    setNewCollectionName('');
    setShowCreateCollection(false);
    loadCollections();
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Hub</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your second brain. Store, organize, and recall anything across all entities — AI surfaces it when you need it.
          </p>
        </div>

        {/* Entity filter dropdown */}
        {entities.length > 0 && (
          <select
            value={selectedEntityId}
            onChange={(e) => handleEntityChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name} ({ent.type})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Entries" value={stats.total} icon={'\uD83D\uDCDA'} />
        <StatCard label="Notes" value={stats.notes} icon={'\uD83D\uDCDD'} />
        <StatCard label="Links" value={stats.links} icon={'\uD83D\uDD17'} />
        <StatCard label="Files" value={stats.files} icon={'\uD83D\uDCC1'} />
      </div>

      {/* Quick capture */}
      <QuickCaptureBar
        entityId={selectedEntityId}
        onCaptured={loadEntries}
        entities={entities}
        onEntityChange={handleEntityChange}
      />

      {/* Search */}
      <SearchBar onSearch={handleSearch} availableTags={availableTagNames} />

      {/* Tabs navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSearchResults(null);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Active tag filter indicator */}
      {activeTagFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Filtered by tag:</span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            {activeTagFilter}
          </span>
          <button
            onClick={() => setActiveTagFilter(null)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        </div>
      )}

      {/* Content area */}
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
      ) : activeTab === 'collections' ? (
        /* Collections view */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Collections</h2>
            <button
              onClick={() => setShowCreateCollection(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            >
              + New Collection
            </button>
          </div>

          {showCreateCollection && (
            <div className="flex gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                placeholder="Collection name..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCreateCollection}
                disabled={!newCollectionName.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateCollection(false);
                  setNewCollectionName('');
                }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}

          {collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-3">{'\uD83D\uDCC2'}</span>
              <p className="text-sm font-medium text-gray-500">No collections yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Create a collection to organize related knowledge entries together.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {collections.map((col) => (
                <CollectionCard key={col.id} collection={col} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Entries + sidebar view */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {activeTab === 'all' ? 'Recent Entries' : activeTab === 'notes' ? 'Notes' : activeTab === 'links' ? 'Links' : 'Files'}
              {activeTagFilter ? ` tagged "${activeTagFilter}"` : ''}
            </h2>
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <span className="text-4xl mb-3">{'\uD83D\uDCDA'}</span>
                <p className="text-sm font-medium text-gray-500">No entries yet</p>
                <p className="text-xs text-gray-400 mt-1">Capture something above to get started!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredEntries.map((entry) => (
                  <KnowledgeEntryCard
                    key={entry.id}
                    entry={entry}
                    onDelete={handleDelete}
                  />
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
                <TagCloud tags={tags} onTagClick={handleTagClick} activeTag={activeTagFilter} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
