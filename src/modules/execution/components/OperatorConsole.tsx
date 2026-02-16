'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ActionActor, BlastRadius } from '@/shared/types';
import type { OperatorTimelineEntry } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OperatorConsoleProps {
  entityId: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface TimelineApiResponse {
  data: OperatorTimelineEntry[];
  total: number;
}

interface ActivitySummary {
  totalActions: number;
  byActor: Record<string, number>;
  byType: Record<string, number>;
  byBlastRadius: Record<string, number>;
  topTargets: Array<{ target: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTOR_OPTIONS: ActionActor[] = ['AI', 'HUMAN', 'SYSTEM'];
const BLAST_RADIUS_OPTIONS: BlastRadius[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const ACTOR_DISPLAY: Record<ActionActor, { icon: string; label: string; color: string }> = {
  AI: { icon: 'A', label: 'AI', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  HUMAN: { icon: 'H', label: 'Human', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  SYSTEM: { icon: 'S', label: 'System', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const BLAST_RADIUS_BADGE: Record<BlastRadius, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const TIMELINE_LINE_COLORS: Record<BlastRadius, string> = {
  LOW: 'border-green-300',
  MEDIUM: 'border-yellow-300',
  HIGH: 'border-orange-300',
  CRITICAL: 'border-red-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OperatorConsole({ entityId }: OperatorConsoleProps) {
  // ---- Data state ----------------------------------------------------------
  const [entries, setEntries] = useState<OperatorTimelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Filter state --------------------------------------------------------
  const [actorFilter, setActorFilter] = useState<ActionActor | ''>('');
  const [blastRadiusFilter, setBlastRadiusFilter] = useState<BlastRadius | ''>('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ---- Expanded entries ----------------------------------------------------
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ---- Page ----------------------------------------------------------------
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // ---- Fetch helpers -------------------------------------------------------

  const fetchTimeline = useCallback(async () => {
    try {
      const params = new URLSearchParams({ entityId, page: String(page), pageSize: String(pageSize) });
      if (actorFilter) params.set('actor', actorFilter);
      if (blastRadiusFilter) params.set('blastRadius', blastRadiusFilter);
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/execution/timeline?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.statusText}`);
      const body: TimelineApiResponse = await res.json();
      setEntries(body.data);
      setTotal(body.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [entityId, actorFilter, blastRadiusFilter, search, dateFrom, dateTo, page]);

  const fetchSummary = useCallback(async () => {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const params = new URLSearchParams({
        entityId,
        from: startOfDay.toISOString(),
        to: now.toISOString(),
      });
      const res = await fetch(`/api/execution/timeline/summary?${params.toString()}`);
      if (!res.ok) return;
      const body: ActivitySummary = await res.json();
      setSummary(body);
    } catch {
      // Summary is non-critical; silently ignore.
    }
  }, [entityId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTimeline(), fetchSummary()]);
    setLoading(false);
  }, [fetchTimeline, fetchSummary]);

  // ---- Effects -------------------------------------------------------------

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [actorFilter, blastRadiusFilter, search, dateFrom, dateTo]);

  // ---- Expand helpers ------------------------------------------------------

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Rollback handler ----------------------------------------------------

  const handleRollback = async (actionId: string) => {
    try {
      const res = await fetch(`/api/execution/rollback/${actionId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Rollback failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    }
  };

  // ---- Clear filters -------------------------------------------------------

  const clearFilters = () => {
    setActorFilter('');
    setBlastRadiusFilter('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = actorFilter || blastRadiusFilter || search || dateFrom || dateTo;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ---- Render --------------------------------------------------------------

  return (
    <div className="flex min-h-0 gap-6">
      {/* ==== Filter sidebar ==== */}
      <aside className="w-64 shrink-0 space-y-5 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700">Filters</h3>

        {/* Search */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Search
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions..."
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Actor */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Actor
          </label>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value as ActionActor | '')}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {ACTOR_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTOR_DISPLAY[a].label}
              </option>
            ))}
          </select>
        </div>

        {/* Blast radius */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Blast Radius
          </label>
          <select
            value={blastRadiusFilter}
            onChange={(e) => setBlastRadiusFilter(e.target.value as BlastRadius | '')}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {BLAST_RADIUS_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Date Range
          </label>
          <div className="space-y-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="w-full rounded-md border border-gray-300 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        )}
      </aside>

      {/* ==== Main content ==== */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Operator Console
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Activity timeline &middot; {total} entries
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* ---- Activity summary cards ---- */}
        {summary && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              label="Total Actions"
              value={summary.totalActions}
              color="text-gray-900"
            />
            <SummaryCard
              label="AI Actions"
              value={summary.byActor['AI'] ?? 0}
              color="text-violet-600"
            />
            <SummaryCard
              label="Human Actions"
              value={summary.byActor['HUMAN'] ?? 0}
              color="text-sky-600"
            />
            <SummaryCard
              label="System Actions"
              value={summary.byActor['SYSTEM'] ?? 0}
              color="text-slate-600"
            />
          </div>
        )}

        {/* ---- Error ---- */}
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

        {/* ---- Timeline ---- */}
        <div className="relative space-y-0">
          {entries.length === 0 && !loading && (
            <p className="py-12 text-center text-gray-400">
              No timeline entries found.
            </p>
          )}

          {entries.map((entry, idx) => {
            const isExpanded = expandedIds.has(entry.id);
            const isLast = idx === entries.length - 1;
            const actorInfo = ACTOR_DISPLAY[entry.actor];

            return (
              <div key={entry.id} className="relative flex gap-4">
                {/* ---- Vertical line + icon ---- */}
                <div className="flex flex-col items-center">
                  {/* Actor icon circle */}
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-shadow hover:shadow-md ${actorInfo.color}`}
                    title={actorInfo.label}
                  >
                    {actorInfo.icon}
                  </button>
                  {/* Connecting line */}
                  {!isLast && (
                    <div
                      className={`w-0 flex-1 border-l-2 ${TIMELINE_LINE_COLORS[entry.blastRadius]}`}
                    />
                  )}
                </div>

                {/* ---- Entry content ---- */}
                <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-6'}`}>
                  {/* Timestamp row */}
                  <div className="flex items-center gap-3">
                    <time className="text-xs text-gray-400">
                      {formatTimestamp(entry.timestamp)}
                    </time>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BLAST_RADIUS_BADGE[entry.blastRadius]}`}
                    >
                      {entry.blastRadius}
                    </span>
                    <span className="text-xs text-gray-400">{entry.status}</span>
                  </div>

                  {/* Description */}
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className="mt-1 text-left text-sm text-gray-800 hover:text-gray-600"
                  >
                    <span className="font-medium">{entry.actorName}</span>{' '}
                    <span className="text-gray-600">
                      {entry.actionType} on{' '}
                      <span className="font-medium text-gray-700">
                        {entry.target}
                      </span>
                    </span>
                  </button>

                  {/* Entity context */}
                  {entry.entityName && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Entity: {entry.entityName}
                    </p>
                  )}

                  {/* ---- Expanded detail ---- */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      {/* Full description */}
                      <div>
                        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Full Details
                        </h5>
                        <p className="mt-1 text-sm text-gray-700">
                          {entry.description}
                        </p>
                      </div>

                      {/* Context info */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-xs font-medium text-gray-500">
                            Entity ID
                          </span>
                          <p className="mt-0.5 font-mono text-xs text-gray-700">
                            {entry.entityId}
                          </p>
                        </div>
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

                      {/* Related actions */}
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

                      {/* Rollback button */}
                      <div className="pt-1">
                        <button
                          onClick={() => handleRollback(entry.id)}
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        >
                          Rollback Action
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ---- Pagination ---- */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} entries)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
