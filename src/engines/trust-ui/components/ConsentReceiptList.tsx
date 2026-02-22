'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import ConsentReceiptCard from './ConsentReceiptCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedReceipt {
  id: string;
  actionId: string;
  description: string;
  reason: string;
  impacted: string[];
  reversible: boolean;
  rollbackLink?: string | null;
  confidence: number;
  timestamp: string;
  module: string;
  actionType: string;
  actor: string;
  status: string;
  cost: number;
  blastRadius: string;
}

interface ConsentLogStats {
  actionsToday: number;
  autoCount: number;
  autoPercent: number;
  approvedCount: number;
  approvedPercent: number;
  totalCost: number;
}

interface ConsentReceiptListProps {
  userId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULES = ['All', 'Inbox', 'Calendar', 'Tasks', 'Finance', 'Voice', 'Knowledge'] as const;
const ACTION_TYPES = ['All', 'Read', 'Draft', 'Execute', 'Delete'] as const;
const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export { ConsentReceiptList };

export default function ConsentReceiptList({ userId }: ConsentReceiptListProps) {
  const [receipts, setReceipts] = useState<EnrichedReceipt[]>([]);
  const [stats, setStats] = useState<ConsentLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [moduleFilter, setModuleFilter] = useState<string>('All');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('All');
  const [dateRange, setDateRange] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (moduleFilter !== 'All') params.set('module', moduleFilter);
      if (actionTypeFilter !== 'All') params.set('actionType', actionTypeFilter);
      if (dateRange !== 'all') params.set('dateRange', dateRange);

      const res = await fetch(`/api/trust/consent-log?${params.toString()}`);

      if (!res.ok) {
        throw new Error(`Failed to fetch consent log: ${res.status}`);
      }

      const json = await res.json();
      const data = json.data ?? json;

      setReceipts(data.receipts ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, actionTypeFilter, dateRange]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Client-side text search over loaded results
  const filteredReceipts = useMemo(() => {
    if (!searchQuery.trim()) return receipts;
    const query = searchQuery.toLowerCase();
    return receipts.filter(
      (r) =>
        r.description.toLowerCase().includes(query) ||
        r.reason.toLowerCase().includes(query) ||
        r.module.toLowerCase().includes(query) ||
        r.actionType.toLowerCase().includes(query) ||
        r.impacted.some((i) => i.toLowerCase().includes(query))
    );
  }, [receipts, searchQuery]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getApprovalBadge = (actor: string, status: string) => {
    if (actor === 'AI' || actor === 'SYSTEM') {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          Auto
        </span>
      );
    }
    if (status === 'EXECUTED') {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Approved
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-400">
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading consent log...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-800 dark:text-red-400">
          Error loading consent log
        </p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
        <button
          type="button"
          onClick={fetchReceipts}
          className="mt-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
        {/* Module dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Module:</label>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          >
            {MODULES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Action type dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Action:</label>
          <select
            value={actionTypeFilter}
            onChange={(e) => setActionTypeFilter(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          >
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Date range dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Date:</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          >
            {DATE_RANGES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {/* Text search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search descriptions, reasons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Count header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Consent Receipts
        </h3>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {filteredReceipts.length} of {receipts.length} entries
        </span>
      </div>

      {/* Structured list display (table-like) */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        {/* Table header */}
        <div className="grid grid-cols-[120px_100px_100px_1fr_100px_60px] gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <div>Time</div>
          <div>Module</div>
          <div>Action</div>
          <div>Entity / Description</div>
          <div>Approval</div>
          <div>Detail</div>
        </div>

        {/* Table body */}
        <div className="max-h-[500px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
          {filteredReceipts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {searchQuery
                  ? 'No entries match your search.'
                  : 'No consent receipts found.'}
              </p>
            </div>
          ) : (
            filteredReceipts.map((receipt) => (
              <div key={receipt.id}>
                <div className="grid grid-cols-[120px_100px_100px_1fr_100px_60px] gap-2 items-center px-4 py-3 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {formatTime(receipt.timestamp)}
                  </div>
                  <div>
                    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {receipt.module}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">
                      {receipt.actionType}
                    </span>
                  </div>
                  <div className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                    {receipt.description}
                  </div>
                  <div>{getApprovalBadge(receipt.actor, receipt.status)}</div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === receipt.id ? null : receipt.id)}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    >
                      {expandedId === receipt.id ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>

                {/* Expanded detail card */}
                {expandedId === receipt.id && (
                  <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <ConsentReceiptCard
                      receipt={{
                        id: receipt.id,
                        actionId: receipt.actionId,
                        description: receipt.description,
                        reason: receipt.reason,
                        impacted: receipt.impacted,
                        reversible: receipt.reversible,
                        rollbackLink: receipt.rollbackLink ?? undefined,
                        confidence: receipt.confidence,
                        timestamp: new Date(receipt.timestamp),
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Aggregate stats */}
      {stats && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">Actions today:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{stats.actionsToday}</span>
          </div>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">Auto:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {stats.autoCount} ({stats.autoPercent}%)
            </span>
          </div>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">Approved:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {stats.approvedCount} ({stats.approvedPercent}%)
            </span>
          </div>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">Total cost:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              ${stats.totalCost.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
