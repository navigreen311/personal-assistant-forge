'use client';

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CallActionItem {
  id: string;
  description: string;
}

interface EnhancedCallEntry {
  id: string;
  direction: string;
  contactId?: string;
  contactName?: string;
  entityId: string;
  entityName?: string;
  personaId?: string;
  personaName?: string;
  duration?: number;
  outcome?: string;
  sentiment?: number;
  createdAt: string;
  recordingUrl?: string;
  transcript?: string;
  actionItems?: CallActionItem[];
}

interface EnhancedCallLogTableProps {
  calls: EnhancedCallEntry[];
  onPlayRecording?: (id: string) => void;
  onViewSummary?: (id: string) => void;
  onCreateTask?: (id: string) => void;
  onFollowUp?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SortField = 'date' | 'duration' | 'outcome';

const DIRECTION_OPTIONS = ['All', 'Outbound', 'Inbound'] as const;

const OUTCOME_OPTIONS = [
  'All',
  'Connected',
  'Voicemail',
  'No Answer',
  'Interested',
  'Callback',
  'Not Interested',
] as const;

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'date', label: 'Date' },
  { value: 'duration', label: 'Duration' },
  { value: 'outcome', label: 'Outcome' },
];

const OUTCOME_BADGE_STYLES: Record<string, string> = {
  CONNECTED: 'bg-green-100 text-green-800',
  VOICEMAIL: 'bg-gray-100 text-gray-800',
  NO_ANSWER: 'bg-amber-100 text-amber-800',
  INTERESTED: 'bg-green-100 text-green-800',
  NOT_INTERESTED: 'bg-red-100 text-red-800',
  CALLBACK_REQUESTED: 'bg-blue-100 text-blue-800',
  CALLBACK: 'bg-blue-100 text-blue-800',
};

const OUTCOME_LABEL_MAP: Record<string, string> = {
  All: '',
  Connected: 'CONNECTED',
  Voicemail: 'VOICEMAIL',
  'No Answer': 'NO_ANSWER',
  Interested: 'INTERESTED',
  Callback: 'CALLBACK_REQUESTED',
  'Not Interested': 'NOT_INTERESTED',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sentimentEmoji(sentiment?: number): string {
  if (sentiment === undefined || sentiment === null) return '-';
  if (sentiment > 0.6) return '\u{1F60A}'; // smiling face
  if (sentiment >= 0.3) return '\u{1F610}'; // neutral face
  return '\u{1F61F}'; // worried face
}

function formatOutcomeLabel(outcome: string): string {
  if (outcome === 'CALLBACK_REQUESTED') return 'Callback';
  return outcome.replace(/_/g, ' ');
}

function normalizeDirection(dir: string): 'OUTBOUND' | 'INBOUND' {
  return dir.toUpperCase().includes('IN') ? 'INBOUND' : 'OUTBOUND';
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function OutcomePill({ outcome }: { outcome: string }) {
  const style = OUTCOME_BADGE_STYLES[outcome] ?? 'bg-gray-100 text-gray-800';
  const isInterested = outcome === 'INTERESTED';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {isInterested && <span aria-hidden="true">{'\u2B50'}</span>}
      {formatOutcomeLabel(outcome)}
    </span>
  );
}

function ExpandedRow({
  call,
}: {
  call: EnhancedCallEntry;
}) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="px-6 py-4 bg-gray-50 space-y-4 text-sm">
      {/* AI Call Summary */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">AI Call Summary</h4>
        <p className="text-gray-600">No summary available</p>
      </div>

      {/* Key Info Extracted */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">Key Info Extracted</h4>
        <p className="text-gray-500 italic">No key information extracted</p>
      </div>

      {/* Action Items */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">Action Items</h4>
        {call.actionItems && call.actionItems.length > 0 ? (
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            {call.actionItems.map((item) => (
              <li key={item.id}>{item.description}</li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 italic">No action items</p>
        )}
      </div>

      {/* Transcript Toggle */}
      <div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowTranscript((prev) => !prev);
          }}
          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
        >
          {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
        </button>
        {showTranscript && (
          <div className="mt-2 p-3 bg-white border border-gray-200 rounded-md text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
            {call.transcript || 'No transcript available'}
          </div>
        )}
      </div>

      {/* Compliance */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">Compliance</h4>
        <p className="text-gray-600">
          Consent Status:{' '}
          <span className="font-medium">
            {call.recordingUrl ? 'Consent Obtained' : 'Not Recorded'}
          </span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedCallLogTable({
  calls,
  onPlayRecording,
  onViewSummary,
  onCreateTask,
  onFollowUp,
}: EnhancedCallLogTableProps) {
  // --- Filter / sort state ---
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('All');
  const [directionFilter, setDirectionFilter] = useState<string>('All');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('All');
  const [sortField, setSortField] = useState<SortField>('date');

  // --- Selection & expansion ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Derive unique entities ---
  const entities = useMemo(() => {
    const names = new Set<string>();
    calls.forEach((c) => {
      if (c.entityName) names.add(c.entityName);
    });
    return ['All', ...Array.from(names).sort()];
  }, [calls]);

  // --- Filtered & sorted data ---
  const filtered = useMemo(() => {
    let result = [...calls];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.contactName && c.contactName.toLowerCase().includes(q)) ||
          (c.entityName && c.entityName.toLowerCase().includes(q)) ||
          (c.personaName && c.personaName.toLowerCase().includes(q)) ||
          c.id.toLowerCase().includes(q),
      );
    }

    // Entity
    if (entityFilter !== 'All') {
      result = result.filter((c) => c.entityName === entityFilter);
    }

    // Direction
    if (directionFilter !== 'All') {
      const dir = directionFilter.toUpperCase();
      result = result.filter((c) => normalizeDirection(c.direction) === dir);
    }

    // Outcome
    if (outcomeFilter !== 'All') {
      const mapped = OUTCOME_LABEL_MAP[outcomeFilter] || outcomeFilter;
      result = result.filter((c) => c.outcome === mapped);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortField) {
        case 'duration':
          return (b.duration ?? 0) - (a.duration ?? 0);
        case 'outcome':
          return (a.outcome ?? '').localeCompare(b.outcome ?? '');
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [calls, search, entityFilter, directionFilter, outcomeFilter, sortField]);

  // --- Handlers ---

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // --- Render ---

  return (
    <div className="space-y-4">
      {/* ---- Filter Bar ---- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <input
          type="text"
          placeholder="Search calls..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-56"
        />

        {/* Entity */}
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {entities.map((ent) => (
            <option key={ent} value={ent}>
              {ent === 'All' ? 'All Entities' : ent}
            </option>
          ))}
        </select>

        {/* Direction */}
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {DIRECTION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'All' ? 'All Directions' : opt}
            </option>
          ))}
        </select>

        {/* Outcome */}
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {OUTCOME_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'All' ? 'All Outcomes' : opt}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Table ---- */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dir
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Persona
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Outcome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sentiment
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 bg-white">
            {filtered.map((call) => {
              const isOutbound = normalizeDirection(call.direction) === 'OUTBOUND';
              const isExpanded = expandedId === call.id;

              return (
                <tr key={call.id} className="contents">
                  {/* Main row */}
                  <td
                    colSpan={10}
                    className="p-0"
                  >
                    <div
                      onClick={() => toggleExpand(call.id)}
                      className={`grid cursor-pointer hover:bg-gray-50 ${
                        isExpanded ? 'bg-blue-50/40' : ''
                      }`}
                      style={{
                        gridTemplateColumns:
                          '40px 60px 1fr 1fr 1fr 80px 140px 90px 100px 200px',
                      }}
                    >
                      {/* Checkbox */}
                      <div className="px-4 py-3 flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(call.id)}
                          onClick={(e) => toggleSelect(call.id, e)}
                          onChange={() => {}}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>

                      {/* Direction */}
                      <div className="px-4 py-3 flex items-center whitespace-nowrap">
                        {isOutbound ? (
                          <span className="text-blue-500" title="Outbound">
                            {'\u{1F4DE}\u2192'}
                          </span>
                        ) : (
                          <span className="text-green-500" title="Inbound">
                            {'\u{1F4DE}\u2190'}
                          </span>
                        )}
                      </div>

                      {/* Contact */}
                      <div className="px-4 py-3 text-gray-900 truncate flex items-center">
                        {call.contactName || 'Unknown'}
                      </div>

                      {/* Entity pill */}
                      <div className="px-4 py-3 flex items-center">
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 truncate max-w-[140px]">
                          {call.entityName || call.entityId}
                        </span>
                      </div>

                      {/* Persona */}
                      <div className="px-4 py-3 text-gray-600 truncate flex items-center text-xs">
                        {call.personaName || '-'}
                      </div>

                      {/* Duration */}
                      <div className="px-4 py-3 text-gray-600 whitespace-nowrap flex items-center text-xs tabular-nums">
                        {formatDuration(call.duration)}
                      </div>

                      {/* Outcome */}
                      <div className="px-4 py-3 flex items-center">
                        {call.outcome ? (
                          <OutcomePill outcome={call.outcome} />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>

                      {/* Sentiment */}
                      <div className="px-4 py-3 flex items-center text-base">
                        {sentimentEmoji(call.sentiment)}
                      </div>

                      {/* Date */}
                      <div className="px-4 py-3 text-gray-500 whitespace-nowrap flex items-center text-xs">
                        {relativeTime(call.createdAt)}
                      </div>

                      {/* Actions */}
                      <div className="px-4 py-3 flex items-center gap-1.5">
                        {onPlayRecording && (
                          <button
                            type="button"
                            title="Play Recording"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlayRecording(call.id);
                            }}
                            disabled={!call.recordingUrl}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {'\u25B6'} Play
                          </button>
                        )}
                        {onViewSummary && (
                          <button
                            type="button"
                            title="View Summary"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewSummary(call.id);
                            }}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                          >
                            {'\u{1F4CB}'} Summary
                          </button>
                        )}
                        {onCreateTask && (
                          <button
                            type="button"
                            title="Create Task"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCreateTask(call.id);
                            }}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                          >
                            {'\u{1F4DD}'} Tasks
                          </button>
                        )}
                        {onFollowUp && (
                          <button
                            type="button"
                            title="Follow Up"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFollowUp(call.id);
                            }}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                          >
                            {'\u{1F4E7}'} Follow-up
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded row content */}
                    {isExpanded && <ExpandedRow call={call} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No calls match your filters
          </div>
        )}
      </div>

      {/* ---- Footer summary ---- */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>
          {filtered.length} call{filtered.length !== 1 ? 's' : ''} shown
          {selectedIds.size > 0 && ` \u00B7 ${selectedIds.size} selected`}
        </span>
        <span>
          Total duration:{' '}
          {formatDuration(
            filtered.reduce((sum, c) => sum + (c.duration ?? 0), 0),
          )}
        </span>
      </div>
    </div>
  );
}
