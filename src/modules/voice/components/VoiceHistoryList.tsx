'use client';

import { useState, useMemo } from 'react';
import type { VoiceSession, VoiceIntent } from '@/modules/voice/types';

interface VoiceHistoryEntry {
  id: string;
  session: VoiceSession;
  intent?: VoiceIntent;
  intentLabel?: string;
  timestamp: Date;
  duration: number; // seconds
  success: boolean;
}

interface VoiceHistoryListProps {
  entries: VoiceHistoryEntry[];
  onEntryClick?: (entry: VoiceHistoryEntry) => void;
  onPlayback?: (entry: VoiceHistoryEntry) => void;
  onDelete?: (entryId: string) => void;
  isLoading?: boolean;
}

type SortField = 'timestamp' | 'duration' | 'confidence';
type SortDirection = 'asc' | 'desc';

export default function VoiceHistoryList({
  entries,
  onEntryClick,
  onPlayback,
  onDelete,
  isLoading = false,
}: VoiceHistoryListProps) {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterIntent, setFilterIntent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const availableIntents = useMemo(() => {
    const intents = new Set(entries.map((e) => e.intent).filter(Boolean));
    return Array.from(intents) as VoiceIntent[];
  }, [entries]);

  const processedEntries = useMemo(() => {
    let filtered = [...entries];

    if (filterIntent) {
      filtered = filtered.filter((e) => e.intent === filterIntent);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.session.transcript?.toLowerCase().includes(query) ||
          e.intentLabel?.toLowerCase().includes(query) ||
          e.intent?.toLowerCase().includes(query),
      );
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'timestamp':
          cmp = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'duration':
          cmp = a.duration - b.duration;
          break;
        case 'confidence':
          cmp = (a.session.confidence ?? 0) - (b.session.confidence ?? 0);
          break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [entries, sortField, sortDirection, filterIntent, searchQuery]);

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Voice History</h3>
          <span className="text-xs text-gray-400">
            {processedEntries.length} of {entries.length} entries
          </span>
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search transcripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {availableIntents.length > 0 && (
            <select
              value={filterIntent ?? ''}
              onChange={(e) => setFilterIntent(e.target.value || null)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All intents</option>
              {availableIntents.map((intent) => (
                <option key={intent} value={intent}>
                  {formatIntent(intent)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400">Sort by:</span>
          {(['timestamp', 'duration', 'confidence'] as SortField[]).map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => handleSortToggle(field)}
              className={`flex items-center gap-0.5 rounded px-2 py-0.5 text-xs transition-colors ${
                sortField === field
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {field === 'timestamp' ? 'Time' : field === 'confidence' ? 'Confidence' : 'Duration'}
              {sortField === field && (
                <svg
                  className={`h-3 w-3 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Entry List */}
      <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
        {processedEntries.length === 0 ? (
          <div className="py-10 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500">No voice interactions found.</p>
            {(searchQuery || filterIntent) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterIntent(null);
                }}
                className="mt-1 text-xs text-blue-600 hover:text-blue-700"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          processedEntries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
                onEntryClick ? 'cursor-pointer' : ''
              }`}
              onClick={() => onEntryClick?.(entry)}
            >
              {/* Status icon */}
              <div
                className={`flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${
                  entry.success ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                {entry.success ? (
                  <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {entry.intent && entry.intent !== 'UNKNOWN' && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {formatIntent(entry.intent)}
                    </span>
                  )}
                  {entry.session.confidence !== undefined && (
                    <span
                      className={`text-xs font-mono ${
                        entry.session.confidence >= 0.8
                          ? 'text-green-600'
                          : entry.session.confidence >= 0.5
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {Math.round(entry.session.confidence * 100)}%
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-800 line-clamp-2">
                  {entry.session.transcript || 'No transcript available'}
                </p>

                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span>{formatTimestamp(entry.timestamp)}</span>
                  <span>{formatDuration(entry.duration)}</span>
                  <span className="capitalize">{entry.session.audioFormat}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {onPlayback && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayback(entry);
                    }}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    aria-label="Play recording"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(entry.id);
                    }}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    aria-label="Delete entry"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatIntent(intent: string): string {
  return intent
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
