'use client';

import { useState } from 'react';
import type { CaptureType } from '@/modules/knowledge/types';

interface SearchBarProps {
  onSearch: (query: string, filters: { types?: CaptureType[]; tags?: string[]; source?: string }) => void;
}

const CAPTURE_TYPES: CaptureType[] = ['NOTE', 'BOOKMARK', 'VOICE_MEMO', 'CODE_SNIPPET', 'QUOTE', 'ARTICLE', 'IMAGE_NOTE'];

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<CaptureType[]>([]);
  const [tagInput, setTagInput] = useState('');

  function handleSearch() {
    onSearch(query, {
      types: selectedTypes.length > 0 ? selectedTypes : undefined,
      tags: tagInput.trim() ? tagInput.split(',').map((t) => t.trim()) : undefined,
    });
  }

  function toggleType(type: CaptureType) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search knowledge..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
        >
          Filters
        </button>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Search
        </button>
      </div>
      {showFilters && (
        <div className="p-3 bg-gray-50 rounded-md space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-700">Types</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {CAPTURE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`text-xs px-2 py-1 rounded-full ${
                    selectedTypes.includes(type)
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g., react, typescript"
              className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
