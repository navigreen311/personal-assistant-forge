'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ActionActor, BlastRadius } from '@/shared/types';
import type { QueuedAction } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FlightControlProps {
  entityId: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface QueueApiResponse {
  data: QueuedAction[];
  total: number;
}

interface QueueStatsResponse {
  pending: number;
  executedToday: number;
  rolledBack: number;
  totalCostToday: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: QueuedAction['status'][] = [
  'QUEUED',
  'APPROVED',
  'EXECUTING',
  'EXECUTED',
  'REJECTED',
  'ROLLED_BACK',
  'FAILED',
];

const ACTOR_OPTIONS: ActionActor[] = ['AI', 'HUMAN', 'SYSTEM'];

const BLAST_RADIUS_OPTIONS: BlastRadius[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const AUTO_REFRESH_MS = 15_000;

const BLAST_RADIUS_COLORS: Record<BlastRadius, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const STATUS_COLORS: Record<QueuedAction['status'], string> = {
  QUEUED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  EXECUTING: 'bg-purple-100 text-purple-800',
  EXECUTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  ROLLED_BACK: 'bg-amber-100 text-amber-800',
  FAILED: 'bg-red-200 text-red-900',
};

const ACTOR_ICONS: Record<ActionActor, string> = {
  AI: 'A',
  HUMAN: 'H',
  SYSTEM: 'S',
};

const ACTOR_ICON_COLORS: Record<ActionActor, string> = {
  AI: 'bg-violet-200 text-violet-800',
  HUMAN: 'bg-sky-200 text-sky-800',
  SYSTEM: 'bg-slate-200 text-slate-800',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCost(cost: number | undefined): string {
  if (cost === undefined || cost === null) return '--';
  return `$${cost.toFixed(2)}`;
}

function formatTime(date: Date | string | undefined): string {
  if (!date) return '--';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FlightControl({ entityId }: FlightControlProps) {
  // ---- Data state ----------------------------------------------------------
  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<QueueStatsResponse>({
    pending: 0,
    executedToday: 0,
    rolledBack: 0,
    totalCostToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Filter state --------------------------------------------------------
  const [statusFilter, setStatusFilter] = useState<QueuedAction['status'] | ''>('');
  const [actorFilter, setActorFilter] = useState<ActionActor | ''>('');
  const [blastRadiusFilter, setBlastRadiusFilter] = useState<BlastRadius | ''>('');

  // ---- Selection state -----------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- Expanded rows -------------------------------------------------------
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ---- Auto-refresh --------------------------------------------------------
  const [autoRefresh, setAutoRefresh] = useState(true);

  // ---- Fetch helpers -------------------------------------------------------

  const fetchQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams({ entityId });
      if (statusFilter) params.set('status', statusFilter);
      if (actorFilter) params.set('actor', actorFilter);
      if (blastRadiusFilter) params.set('blastRadius', blastRadiusFilter);

      const res = await fetch(`/api/execution/queue?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch queue: ${res.statusText}`);
      const body: QueueApiResponse = await res.json();
      setActions(body.data);
      setTotal(body.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [entityId, statusFilter, actorFilter, blastRadiusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/execution/queue/stats?entityId=${entityId}`);
      if (!res.ok) return;
      const body: QueueStatsResponse = await res.json();
      setStats(body);
    } catch {
      // Stats are non-critical; silently ignore errors.
    }
  }, [entityId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchQueue(), fetchStats()]);
    setLoading(false);
  }, [fetchQueue, fetchStats]);

  // ---- Initial + auto refresh ----------------------------------------------

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  // ---- Action handlers -----------------------------------------------------

  const handleApprove = async (actionId: string) => {
    try {
      const res = await fetch(`/api/execution/queue/${actionId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Approve failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      const res = await fetch(`/api/execution/queue/${actionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected from Flight Control' }),
      });
      if (!res.ok) throw new Error('Reject failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/execution/queue/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error('Bulk approve failed');
      setSelectedIds(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk approve failed');
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/execution/queue/bulk-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionIds: Array.from(selectedIds),
          reason: 'Bulk rejected from Flight Control',
        }),
      });
      if (!res.ok) throw new Error('Bulk reject failed');
      setSelectedIds(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk reject failed');
    }
  };

  // ---- Selection helpers ---------------------------------------------------

  const queuedActions = useMemo(
    () => actions.filter((a) => a.status === 'QUEUED'),
    [actions],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === queuedActions.length && queuedActions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queuedActions.map((a) => a.id)));
    }
  };

  // ---- Expand helpers ------------------------------------------------------

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Flight Control</h2>
          <p className="mt-1 text-sm text-gray-500">
            Action queue &middot; {total} total
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={() => setAutoRefresh((v) => !v)}
              className="rounded border-gray-300"
            />
            Auto-refresh
          </label>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ---- Stats row ---- */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={stats.pending} color="text-blue-600" />
        <StatCard label="Executed today" value={stats.executedToday} color="text-green-600" />
        <StatCard label="Rolled back" value={stats.rolledBack} color="text-amber-600" />
        <StatCard
          label="Cost today"
          value={formatCost(stats.totalCostToday)}
          color="text-gray-900"
        />
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <span className="text-sm font-medium text-gray-600">Filters:</span>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as QueuedAction['status'] | '')}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value as ActionActor | '')}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All actors</option>
          {ACTOR_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={blastRadiusFilter}
          onChange={(e) => setBlastRadiusFilter(e.target.value as BlastRadius | '')}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All blast radii</option>
          {BLAST_RADIUS_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {(statusFilter || actorFilter || blastRadiusFilter) && (
          <button
            onClick={() => {
              setStatusFilter('');
              setActorFilter('');
              setBlastRadiusFilter('');
            }}
            className="text-sm text-gray-500 underline hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* ---- Bulk actions ---- */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <span className="text-sm font-medium text-blue-800">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkApprove}
            className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
          >
            Approve selected
          </button>
          <button
            onClick={handleBulkReject}
            className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
          >
            Reject selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-blue-600 underline hover:text-blue-800"
          >
            Clear selection
          </button>
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

      {/* ---- Table ---- */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={
                    queuedActions.length > 0 &&
                    selectedIds.size === queuedActions.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Actor</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Action</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Target</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Reason</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">
                Blast Radius
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Cost</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Scheduled</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white">
            {actions.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                  No actions found.
                </td>
              </tr>
            )}

            {actions.map((action) => {
              const isExpanded = expandedIds.has(action.id);
              const isQueued = action.status === 'QUEUED';

              return (
                <ActionRow
                  key={action.id}
                  action={action}
                  isExpanded={isExpanded}
                  isSelected={selectedIds.has(action.id)}
                  isQueued={isQueued}
                  onToggleExpand={() => toggleExpand(action.id)}
                  onToggleSelect={() => toggleSelect(action.id)}
                  onApprove={() => handleApprove(action.id)}
                  onReject={() => handleReject(action.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
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

// ---------------------------------------------------------------------------

interface ActionRowProps {
  action: QueuedAction;
  isExpanded: boolean;
  isSelected: boolean;
  isQueued: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function ActionRow({
  action,
  isExpanded,
  isSelected,
  isQueued,
  onToggleExpand,
  onToggleSelect,
  onApprove,
  onReject,
}: ActionRowProps) {
  return (
    <>
      {/* ---- Main row ---- */}
      <tr
        className="cursor-pointer transition-colors hover:bg-gray-50"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          {isQueued && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-300"
            />
          )}
        </td>

        {/* Status badge */}
        <td className="px-3 py-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_COLORS[action.status]
            }`}
          >
            {action.status}
          </span>
        </td>

        {/* Actor icon */}
        <td className="px-3 py-2">
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              ACTOR_ICON_COLORS[action.actor]
            }`}
            title={action.actor}
          >
            {ACTOR_ICONS[action.actor]}
          </span>
        </td>

        {/* Action type */}
        <td className="px-3 py-2 font-medium text-gray-900">
          {action.actionType}
        </td>

        {/* Target */}
        <td className="max-w-[180px] truncate px-3 py-2 text-gray-700">
          {action.target}
        </td>

        {/* Reason */}
        <td className="max-w-[200px] truncate px-3 py-2 text-gray-500">
          {action.reason}
        </td>

        {/* Blast radius */}
        <td className="px-3 py-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              BLAST_RADIUS_COLORS[action.blastRadius]
            }`}
          >
            {action.blastRadius}
          </span>
        </td>

        {/* Cost */}
        <td className="px-3 py-2 text-right font-mono text-gray-700">
          {formatCost(action.estimatedCost)}
        </td>

        {/* Scheduled */}
        <td className="whitespace-nowrap px-3 py-2 text-gray-500">
          {formatTime(action.scheduledFor)}
        </td>

        {/* Inline actions */}
        <td
          className="px-3 py-2 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          {isQueued && (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={onApprove}
                className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Reject
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* ---- Expanded detail row ---- */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={10} className="px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <DetailSection title="Description">
                <p className="text-sm text-gray-700">
                  {action.description || 'No description provided.'}
                </p>
              </DetailSection>

              <DetailSection title="Impact Statement">
                <p className="text-sm text-gray-700">
                  {action.impact || 'No impact statement.'}
                </p>
              </DetailSection>

              <DetailSection title="Rollback Plan">
                <p className="text-sm text-gray-700">
                  {action.rollbackPlan || 'No rollback plan.'}
                </p>
                {action.reversible ? (
                  <span className="mt-1 inline-block text-xs text-green-600">
                    Reversible
                  </span>
                ) : (
                  <span className="mt-1 inline-block text-xs text-red-600">
                    Irreversible
                  </span>
                )}
              </DetailSection>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h4>
      {children}
    </div>
  );
}
