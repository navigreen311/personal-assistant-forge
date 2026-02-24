'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ActionActor } from '@/shared/types';
import type { OperatorTimelineEntry } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedOperatorConsoleProps {
  entityId?: string;
  simulationMode?: boolean;
}

// ---------------------------------------------------------------------------
// API response shape
// ---------------------------------------------------------------------------

interface TimelineApiResponse {
  data: OperatorTimelineEntry[];
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ModuleFilter =
  | ''
  | 'Communication'
  | 'Tasks'
  | 'Inbox'
  | 'Workflows'
  | 'VoiceForge'
  | 'Calendar';

type DateRangePreset = 'today' | '7d' | '30d' | 'all';

const MODULE_OPTIONS: ModuleFilter[] = [
  'Communication',
  'Tasks',
  'Inbox',
  'Workflows',
  'VoiceForge',
  'Calendar',
];

const ACTOR_OPTIONS: Array<ActionActor | ''> = ['', 'AI', 'HUMAN', 'SYSTEM'];

const ACTOR_LABELS: Record<string, string> = {
  '': 'All',
  AI: 'AI',
  HUMAN: 'Human',
  SYSTEM: 'System',
};

const ACTOR_ICON: Record<ActionActor, { emoji: string; bg: string }> = {
  AI: { emoji: '\u{1F916}', bg: 'bg-blue-100' },
  HUMAN: { emoji: '\u{1F464}', bg: 'bg-green-100' },
  SYSTEM: { emoji: '\u2699', bg: 'bg-gray-100' },
};

const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  '7d': 'Last 7d',
  '30d': 'Last 30d',
  all: 'All',
};

const AUTO_REFRESH_INTERVAL_MS = 15_000;
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateHeader(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateRangeFromPreset(preset: DateRangePreset): { from?: string; to?: string } {
  if (preset === 'all') return {};
  const now = new Date();
  const to = now.toISOString();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: start.toISOString(), to };
  }
  if (preset === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to };
  }
  // 30d
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to };
}

function deriveAutomationLevel(entry: OperatorTimelineEntry): string {
  if (entry.actor === 'AI') {
    if (
      entry.status === 'EXECUTED' ||
      entry.status === 'COMPLETED' ||
      entry.status === 'DONE'
    ) {
      return 'Auto';
    }
    return 'Approved';
  }
  return 'Manual';
}

function deriveModule(entry: OperatorTimelineEntry): string {
  const type = entry.actionType.toLowerCase();
  const target = entry.target.toLowerCase();
  const desc = entry.description.toLowerCase();
  if (type.includes('email') || type.includes('message') || desc.includes('email') || target.includes('email')) return 'Communication';
  if (type.includes('task') || target.includes('task') || desc.includes('task')) return 'Tasks';
  if (type.includes('inbox') || target.includes('inbox') || desc.includes('triage') || desc.includes('inbox')) return 'Inbox';
  if (type.includes('workflow') || target.includes('workflow') || desc.includes('workflow')) return 'Workflows';
  if (type.includes('voice') || target.includes('voice') || desc.includes('voice') || desc.includes('call')) return 'VoiceForge';
  if (type.includes('calendar') || type.includes('meeting') || target.includes('calendar') || desc.includes('calendar') || desc.includes('meeting')) return 'Calendar';
  return entry.actionType;
}

// ---------------------------------------------------------------------------
// Grouped timeline type
// ---------------------------------------------------------------------------

interface DateGroup {
  dateKey: string;
  label: string;
  entries: OperatorTimelineEntry[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedOperatorConsole({
  entityId,
  simulationMode = false,
}: EnhancedOperatorConsoleProps) {
  // ---- Data state ----------------------------------------------------------
  const [entries, setEntries] = useState<OperatorTimelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Filter state --------------------------------------------------------
  const [actorFilter, setActorFilter] = useState<ActionActor | ''>('');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all');

  // ---- Pagination ----------------------------------------------------------
  const [page, setPage] = useState(1);

  // ---- Auto-refresh --------------------------------------------------------
  const [autoRefresh, setAutoRefresh] = useState(true);

  // ---- Fetch helpers -------------------------------------------------------

  const fetchTimeline = useCallback(
    async (targetPage: number, append: boolean = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });

        if (entityId) params.set('entityId', entityId);
        if (actorFilter) params.set('actor', actorFilter);
        if (moduleFilter) params.set('module', moduleFilter);

        const dateRange = getDateRangeFromPreset(dateRangePreset);
        if (dateRange.from) params.set('from', dateRange.from);
        if (dateRange.to) params.set('to', dateRange.to);

        const res = await fetch(
          `/api/execution/timeline?${params.toString()}`
        );
        if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.statusText}`);

        const body = await res.json();

        if (append) {
          setEntries((prev) => [...prev, ...(body.data ?? [])]);
        } else {
          setEntries(body.data ?? []);
        }
        setTotal(body.meta?.total ?? body.total ?? 0);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entityId, actorFilter, moduleFilter, dateRangePreset]
  );

  // ---- Initial load & filter change ----------------------------------------

  useEffect(() => {
    setPage(1);
    fetchTimeline(1, false);
  }, [fetchTimeline]);

  // ---- Auto-refresh --------------------------------------------------------

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTimeline(1, false);
      setPage(1);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTimeline]);

  // ---- Load more handler ---------------------------------------------------

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTimeline(nextPage, true);
  };

  const hasMore = entries.length < total;

  // ---- Group entries by date -----------------------------------------------

  const dateGroups: DateGroup[] = useMemo(() => {
    const groupMap = new Map<string, OperatorTimelineEntry[]>();

    for (const entry of entries) {
      const key = toDateKey(entry.timestamp);
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(entry);
    }

    const groups: DateGroup[] = [];
    for (const [dateKey, groupEntries] of groupMap) {
      groups.push({
        dateKey,
        label: formatDateHeader(groupEntries[0].timestamp),
        entries: groupEntries.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ),
      });
    }

    // Sort groups newest first
    groups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return groups;
  }, [entries]);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ==== Header ==== */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Operator Console
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Complete timeline of all platform activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          {autoRefresh && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Live
            </span>
          )}
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              autoRefresh
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
          </button>
          {simulationMode && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Simulation Mode
            </span>
          )}
        </div>
      </div>

      {/* ==== Filters ==== */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-sm font-medium text-gray-600">Filters:</span>

        {/* Entity filter */}
        {entityId ? (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            Entity: {entityId}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-500 ring-1 ring-inset ring-gray-200">
            All Entities
          </span>
        )}

        {/* Actor dropdown */}
        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value as ActionActor | '')}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {ACTOR_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {ACTOR_LABELS[opt]}
            </option>
          ))}
        </select>

        {/* Module dropdown */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value as ModuleFilter)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">All Modules</option>
          {MODULE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Date range preset */}
        <div className="flex rounded-md border border-gray-300">
          {(Object.entries(DATE_RANGE_LABELS) as [DateRangePreset, string][]).map(
            ([preset, label]) => (
              <button
                key={preset}
                onClick={() => setDateRangePreset(preset)}
                className={`px-3 py-1.5 text-sm transition-colors first:rounded-l-md last:rounded-r-md ${
                  dateRangePreset === preset
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* Results count */}
        <span className="ml-auto text-xs text-gray-400">
          {total} {total === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* ==== Error ==== */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 underline hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ==== Loading state ==== */}
      {loading && entries.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="mt-3 text-sm text-gray-400">Loading activity...</p>
        </div>
      )}

      {/* ==== Empty state ==== */}
      {!loading && entries.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-400">
            No activity recorded yet. Actions will appear here as they&apos;re
            performed.
          </p>
        </div>
      )}

      {/* ==== Timeline ==== */}
      {dateGroups.length > 0 && (
        <div className="space-y-8">
          {dateGroups.map((group) => (
            <div key={group.dateKey}>
              {/* ---- Date header ---- */}
              <div className="flex items-center gap-3 pb-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* ---- Entries for this date ---- */}
              <div className="space-y-4">
                {group.entries.map((entry) => (
                  <TimelineEntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==== Load more ==== */}
      {hasMore && !loading && (
        <div className="pt-2 text-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more...'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimelineEntryRow sub-component
// ---------------------------------------------------------------------------

function TimelineEntryRow({ entry }: { entry: OperatorTimelineEntry }) {
  const [showDetails, setShowDetails] = useState(false);
  const actorInfo = ACTOR_ICON[entry.actor];
  const automationLevel = deriveAutomationLevel(entry);
  const moduleName = deriveModule(entry);

  const automationBadgeClass =
    automationLevel === 'Auto'
      ? 'bg-violet-100 text-violet-700'
      : automationLevel === 'Approved'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-600';

  return (
    <div className="group flex gap-4">
      {/* ---- Time column ---- */}
      <div className="w-20 shrink-0 pt-0.5 text-right">
        <time className="text-sm text-gray-500">{formatTime(entry.timestamp)}</time>
      </div>

      {/* ---- Actor icon ---- */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${actorInfo.bg}`}
        title={entry.actor}
      >
        {actorInfo.emoji}
      </div>

      {/* ---- Content ---- */}
      <div className="min-w-0 flex-1">
        {/* Description */}
        <p className="text-sm font-semibold text-gray-900">
          {entry.description}
        </p>

        {/* Metadata line */}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>Module: {moduleName}</span>
          <span className="text-gray-300">|</span>

          {entry.entityName && (
            <>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {entry.entityName}
              </span>
              <span className="text-gray-300">|</span>
            </>
          )}

          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${automationBadgeClass}`}
          >
            {automationLevel}
          </span>
        </div>

        {/* Action links */}
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {showDetails ? 'Hide details' : 'View details'}
          </button>
          {entry.relatedActions.length > 0 && (
            <button
              onClick={() => setShowDetails(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View related ({entry.relatedActions.length})
            </button>
          )}
        </div>

        {/* Expanded details */}
        {showDetails && (
          <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Full Details
              </h5>
              <p className="mt-1 text-sm text-gray-700">{entry.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <span className="text-xs font-medium text-gray-500">
                  Action Type
                </span>
                <p className="mt-0.5 text-xs text-gray-700">{entry.actionType}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Target</span>
                <p className="mt-0.5 text-xs text-gray-700">{entry.target}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">
                  Blast Radius
                </span>
                <p className="mt-0.5 text-xs text-gray-700">{entry.blastRadius}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Status</span>
                <p className="mt-0.5 text-xs text-gray-700">{entry.status}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Actor</span>
                <p className="mt-0.5 text-xs text-gray-700">{entry.actorName}</p>
              </div>
              {entry.entityId && (
                <div>
                  <span className="text-xs font-medium text-gray-500">
                    Entity ID
                  </span>
                  <p className="mt-0.5 font-mono text-xs text-gray-700">
                    {entry.entityId}
                  </p>
                </div>
              )}
              {entry.projectId && (
                <div>
                  <span className="text-xs font-medium text-gray-500">
                    Project
                  </span>
                  <p className="mt-0.5 text-xs text-gray-700">
                    {entry.projectName ?? entry.projectId}
                  </p>
                </div>
              )}
            </div>

            {entry.relatedActions.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Related Actions
                </h5>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {entry.relatedActions.map((relId) => (
                    <li
                      key={relId}
                      className="rounded bg-gray-200 px-2 py-0.5 font-mono text-xs text-gray-600"
                    >
                      {relId.slice(0, 8)}...
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
