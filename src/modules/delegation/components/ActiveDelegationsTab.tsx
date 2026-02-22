'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveDelegationsTabProps {
  entityId?: string;
  onRefreshStats?: () => void;
}

type DelegationStatus =
  | 'Complete'
  | 'In Progress'
  | 'Not Started'
  | 'Blocked'
  | 'Waiting Approval';

interface DelegationMessage {
  id: string;
  from: string;
  content: string;
  timestamp: string;
}

interface DelegationDeliverable {
  id: string;
  name: string;
  url?: string;
  status: 'submitted' | 'pending';
}

interface ActiveDelegation {
  id: string;
  task: string;
  assignee: string;
  entity: string;
  status: DelegationStatus;
  dueDate: string;
  progress: number;
  contextPack?: {
    summary: string;
    relevantDocuments: string[];
    notes: string;
  };
  messages?: DelegationMessage[];
  deliverables?: DelegationDeliverable[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: DelegationStatus[] = [
  'Complete',
  'In Progress',
  'Not Started',
  'Blocked',
  'Waiting Approval',
];

const STATUS_BADGE_STYLES: Record<DelegationStatus, { container: string; dot?: string }> = {
  Complete: {
    container: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
  },
  'In Progress': {
    container: 'bg-yellow-100 text-yellow-700',
    dot: 'bg-yellow-500',
  },
  'Not Started': {
    container: 'bg-blue-100 text-blue-700',
  },
  Blocked: {
    container: 'bg-red-100 text-red-700',
  },
  'Waiting Approval': {
    container: 'bg-gray-100 text-gray-600',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `${diffDays}d left`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function isDueDateOverdue(dateStr: string): boolean {
  return new Date(dateStr).getTime() < Date.now();
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DelegationStatus }) {
  const style = STATUS_BADGE_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.container}`}
    >
      {style.dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      )}
      {status}
    </span>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-2 bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
        {clamped}%
      </span>
    </div>
  );
}

function EntityPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 truncate max-w-[140px]">
      {name}
    </span>
  );
}

function ExpandedRowDetail({ delegation }: { delegation: ActiveDelegation }) {
  return (
    <div className="px-6 py-4 bg-gray-50 space-y-4 text-sm border-t border-gray-100">
      {/* Context Pack */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">Context Pack</h4>
        {delegation.contextPack ? (
          <div className="space-y-2">
            <p className="text-gray-600">{delegation.contextPack.summary}</p>
            {delegation.contextPack.relevantDocuments.length > 0 && (
              <div>
                <span className="text-gray-500 text-xs font-medium">Documents:</span>
                <ul className="list-disc list-inside text-gray-600 text-xs mt-1">
                  {delegation.contextPack.relevantDocuments.map((doc, i) => (
                    <li key={i}>{doc}</li>
                  ))}
                </ul>
              </div>
            )}
            {delegation.contextPack.notes && (
              <div>
                <span className="text-gray-500 text-xs font-medium">Notes:</span>
                <p className="text-gray-600 text-xs mt-1">{delegation.contextPack.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 italic">No context pack available</p>
        )}
      </div>

      {/* Messages */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">Messages</h4>
        {delegation.messages && delegation.messages.length > 0 ? (
          <div className="space-y-2">
            {delegation.messages.map((msg) => (
              <div
                key={msg.id}
                className="p-2 bg-white border border-gray-200 rounded-md"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{msg.from}</span>
                  <span className="text-xs text-gray-400">{msg.timestamp}</span>
                </div>
                <p className="text-gray-600 text-xs">{msg.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No messages</p>
        )}
      </div>

      {/* Deliverables */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">Deliverables</h4>
        {delegation.deliverables && delegation.deliverables.length > 0 ? (
          <ul className="space-y-1">
            {delegation.deliverables.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 text-xs text-gray-600"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    d.status === 'submitted' ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                {d.name}
                {d.status === 'submitted' && (
                  <span className="text-green-600 font-medium">Submitted</span>
                )}
                {d.status === 'pending' && (
                  <span className="text-gray-400 font-medium">Pending</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 italic">No deliverables</p>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Filter row skeleton */}
      <div className="flex gap-3 mb-4">
        <div className="h-9 w-56 bg-gray-200 rounded-md" />
        <div className="h-9 w-40 bg-gray-200 rounded-md" />
      </div>
      {/* Table header skeleton */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3">
          <div className="h-4 w-full bg-gray-200 rounded" />
        </div>
        {/* Row skeletons */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="px-4 py-4 border-t border-gray-100 flex items-center gap-4"
          >
            <div className="h-4 w-1/5 bg-gray-200 rounded" />
            <div className="h-4 w-1/6 bg-gray-200 rounded" />
            <div className="h-4 w-1/6 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-2 w-24 bg-gray-200 rounded-full" />
            <div className="h-7 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ActiveDelegationsTab({
  entityId,
  onRefreshStats,
}: ActiveDelegationsTabProps) {
  const [delegations, setDelegations] = useState<ActiveDelegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // --- Fetch delegations ---
  const fetchDelegations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: 'active' });
      if (entityId) params.set('entityId', entityId);

      const res = await fetch(`/api/delegation?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch delegations (${res.status})`);
      const data = await res.json();
      setDelegations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchDelegations();
  }, [fetchDelegations]);

  // --- Approve handler ---
  async function handleApprove(delegationId: string) {
    try {
      const res = await fetch(`/api/delegation/${delegationId}/approve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(`Approval failed (${res.status})`);
      await fetchDelegations();
      onRefreshStats?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  // --- Filter logic ---
  const filtered = delegations.filter((d) => {
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matches =
        d.task.toLowerCase().includes(q) ||
        d.assignee.toLowerCase().includes(q) ||
        d.entity.toLowerCase().includes(q);
      if (!matches) return false;
    }

    // Status filter
    if (statusFilter !== 'All' && d.status !== statusFilter) {
      return false;
    }

    return true;
  });

  // --- Toggle expand ---
  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="text-center py-8">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <button
            onClick={fetchDelegations}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      {/* ---- Filter Row ---- */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
        <input
          type="text"
          placeholder="Search tasks, assignees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          <option value="All">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Table ---- */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 px-6">
          <p className="text-gray-500 text-sm">
            {delegations.length === 0
              ? 'No active delegations. Use the Delegate Task button to get started.'
              : 'No delegations match your filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assignee
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px]">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filtered.map((delegation) => {
                const isExpanded = expandedId === delegation.id;
                const overdue = isDueDateOverdue(delegation.dueDate);

                return (
                  <tr key={delegation.id} className="group">
                    <td colSpan={7} className="p-0">
                      {/* Main row */}
                      <div
                        className="grid items-center hover:bg-gray-50 transition-colors"
                        style={{
                          gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.8fr 1fr auto',
                        }}
                      >
                        {/* Task */}
                        <div className="px-4 py-3">
                          <span className="font-semibold text-gray-900">
                            {delegation.task}
                          </span>
                        </div>

                        {/* Assignee */}
                        <div className="px-4 py-3 text-gray-700">
                          {delegation.assignee}
                        </div>

                        {/* Entity */}
                        <div className="px-4 py-3">
                          <EntityPill name={delegation.entity} />
                        </div>

                        {/* Status */}
                        <div className="px-4 py-3">
                          <StatusBadge status={delegation.status} />
                        </div>

                        {/* Due Date */}
                        <div className="px-4 py-3">
                          <span
                            className={`text-xs whitespace-nowrap ${
                              overdue && delegation.status !== 'Complete'
                                ? 'text-red-600 font-medium'
                                : 'text-gray-500'
                            }`}
                          >
                            {formatDueDate(delegation.dueDate)}
                          </span>
                        </div>

                        {/* Progress */}
                        <div className="px-4 py-3">
                          <ProgressBar progress={delegation.progress} />
                        </div>

                        {/* Actions */}
                        <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => toggleExpand(delegation.id)}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              alert(`Message feature coming soon for: ${delegation.task}`)
                            }
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                          >
                            Message
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              alert(`Reassign feature coming soon for: ${delegation.task}`)
                            }
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
                          >
                            Reassign
                          </button>

                          {delegation.status === 'Complete' && (
                            <>
                              <button
                                type="button"
                                onClick={() => toggleExpand(delegation.id)}
                                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors"
                              >
                                Review
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApprove(delegation.id)}
                                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                              >
                                Approve
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <ExpandedRowDetail delegation={delegation} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Footer ---- */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-4 py-3 border-t border-gray-100">
        <span>
          {filtered.length} delegation{filtered.length !== 1 ? 's' : ''} shown
          {filtered.length !== delegations.length &&
            ` of ${delegations.length} total`}
        </span>
      </div>
    </div>
  );
}
