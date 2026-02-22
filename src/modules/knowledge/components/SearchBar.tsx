'use client';

import { useState } from 'react';
import type { CaptureType } from '@/modules/knowledge/types';

interface SearchBarProps {
  onSearch: (query: string, filters: {
    types?: CaptureType[];
    tags?: string[];
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: 'recent' | 'most_used';
  }) => void;
  availableTags?: string[];
}

const TYPE_FILTER_OPTIONS: { value: CaptureType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'NOTE', label: 'Note' },
  { value: 'BOOKMARK', label: 'Link' },
  { value: 'ARTICLE', label: 'File' },
  { value: 'CODE_SNIPPET', label: 'Snippet' },
  { value: 'VOICE_MEMO', label: 'Voice Memo' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'IMAGE_NOTE', label: 'Image Note' },
];

const DATE_RANGE_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'most_used', label: 'Most used' },
];

export default function SearchBar({ onSearch, availableTags }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedType, setSelectedType] = useState<CaptureType | 'ALL'>('ALL');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [dateRange, setDateRange] = useState('any');
  const [sort, setSort] = useState<'recent' | 'most_used'>('recent');

  function getDateFilters(): { dateFrom?: string; dateTo?: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateRange) {
      case 'today':
        return {
          dateFrom: today.toISOString(),
          dateTo: now.toISOString(),
        };
      case 'week': {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return {
          dateFrom: weekAgo.toISOString(),
          dateTo: now.toISOString(),
        };
      }
      case 'month': {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return {
          dateFrom: monthAgo.toISOString(),
          dateTo: now.toISOString(),
        };
      }
      default:
        return {};
    }
  }

  function buildFilters() {
    const dateFilters = getDateFilters();
    return {
      types: selectedType !== 'ALL' ? [selectedType] : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      ...dateFilters,
      sort,
    };
  }

  function handleSearch() {
    onSearch(query, buildFilters());
  }

  function handleClearFilters() {
    setSelectedType('ALL');
    setSelectedTags([]);
    setTagInput('');
    setDateRange('any');
    setSort('recent');
  }

  function handleApplyFilters() {
    handleSearch();
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addTagFromInput() {
    const newTags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !selectedTags.includes(t));
    if (newTags.length > 0) {
      setSelectedTags((prev) => [...prev, ...newTags]);
      setTagInput('');
    }
  }

  const hasActiveFilters = selectedType !== 'ALL' || selectedTags.length > 0 || dateRange !== 'any' || sort !== 'recent';

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
          className={`px-3 py-2 border rounded-md text-sm transition-colors ${
            hasActiveFilters
              ? 'border-blue-400 text-blue-600 bg-blue-50 hover:bg-blue-100'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Filters{hasActiveFilters ? ' *' : ''}
        </button>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
          {/* Type filter */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as CaptureType | 'ALL')}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TYPE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tags multi-select */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Tags</label>
            {availableTags && availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {availableTags.slice(0, 15).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-600 hover:border-blue-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTagFromInput();
                  }
                }}
                placeholder="Add tags (comma-separated)"
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              />
              {tagInput.trim() && (
                <button
                  onClick={addTagFromInput}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add
                </button>
              )}
            </div>
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
                  >
                    {tag}
                    <button
                      onClick={() => toggleTag(tag)}
                      className="ml-1 text-blue-500 hover:text-blue-800"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Date filter */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Date</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Sort by</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'recent' | 'most_used')}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Apply / Clear buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md"
            >
              Clear
            </button>
            <button
              onClick={handleApplyFilters}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
