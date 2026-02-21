'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import NewDecisionForm from '@/modules/decisions/components/NewDecisionForm';
import type { DecisionBrief } from '@/modules/decisions/types';
import type { BlastRadius } from '@/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusTab = 'all' | 'active' | 'pending' | 'decided' | 'archived';
type SortField = 'date' | 'urgency' | 'impact' | 'deadline';
type DecisionType = '' | 'strategic' | 'operational' | 'financial' | 'hiring' | 'vendor' | 'investment';
type UrgencyLevel = '' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface DecisionStats {
  active: number;
  pending: number;
  decided: number;
  thisMonth: number;
}

interface EntityOption {
  id: string;
  name: string;
}

interface DecisionItem extends DecisionBrief {
  entityId?: string;
  entityName?: string;
  description?: string;
  status?: string;
  type?: string;
  blastRadius?: BlastRadius;
  deadline?: string;
  stakeholders?: string[];
  request?: {
    description?: string;
    context?: string;
    deadline?: string;
    stakeholders?: string[];
    constraints?: string[];
    blastRadius?: BlastRadius;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLAST_ORDER: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const STATUS_TABS: { key: StatusTab; label: string; countKey?: keyof DecisionStats }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active', countKey: 'active' },
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'decided', label: 'Decided' },
  { key: 'archived', label: 'Archived' },
];

const DECISION_TYPES: { value: DecisionType; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'strategic', label: 'Strategic' },
  { value: 'operational', label: 'Operational' },
  { value: 'financial', label: 'Financial' },
  { value: 'hiring', label: 'Hiring' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'investment', label: 'Investment' },
];

const URGENCY_LEVELS: { value: UrgencyLevel; label: string }[] = [
  { value: '', label: 'All Urgencies' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'date', label: 'Sort by Date' },
  { value: 'urgency', label: 'Sort by Urgency' },
  { value: 'impact', label: 'Sort by Impact' },
  { value: 'deadline', label: 'Sort by Deadline' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency?: string }) {
  if (!urgency) return null;
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-green-100 text-green-800',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[urgency] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {urgency}
    </span>
  );
}

function TypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium capitalize">
      {type}
    </span>
  );
}

function EntityPill({ name }: { name?: string }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-xs font-medium truncate max-w-[160px]">
      {name}
    </span>
  );
}

function DecisionCard({
  decision,
  onClick,
}: {
  decision: DecisionItem;
  onClick: () => void;
}) {
  const blastRadius = decision.blastRadius ?? decision.request?.blastRadius;
  const description = decision.description ?? decision.request?.description ?? decision.recommendation;
  const deadline = decision.deadline ?? decision.request?.deadline;
  const stakeholders = decision.stakeholders ?? decision.request?.stakeholders ?? [];
  const confidencePercent = Math.round(decision.confidenceScore * 100);

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Top row: entity pill, badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <EntityPill name={decision.entityName} />
        <UrgencyBadge urgency={blastRadius} />
        <TypeBadge type={decision.type} />
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 truncate">
        {decision.title}
      </h3>

      {/* Description */}
      {description && (
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
      )}

      {/* Confidence bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              confidencePercent >= 70
                ? 'bg-green-500'
                : confidencePercent >= 40
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-16 text-right">
          {confidencePercent}% conf.
        </span>
      </div>

      {/* Bottom row: deadline, stakeholders, recommendation snippet */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          {deadline && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(deadline).toLocaleDateString()}
            </span>
          )}
          {stakeholders.length > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {stakeholders.length} stakeholder{stakeholders.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span>{new Date(decision.createdAt).toLocaleDateString()}</span>
      </div>

      {/* Recommendation */}
      {decision.recommendation && (
        <div className="mt-3 rounded-md bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700 line-clamp-2">
            <span className="font-medium">Recommendation:</span> {decision.recommendation}
          </p>
        </div>
      )}

      {/* Options strategies */}
      {decision.options && decision.options.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {decision.options.map((opt) => (
            <span
              key={opt.id}
              className={`text-xs px-2 py-0.5 rounded ${
                opt.strategy === 'CONSERVATIVE'
                  ? 'bg-blue-50 text-blue-700'
                  : opt.strategy === 'MODERATE'
                    ? 'bg-purple-50 text-purple-700'
                    : 'bg-red-50 text-red-700'
              }`}
            >
              {opt.strategy}
            </span>
          ))}
        </div>
      )}

      {/* Status indicator */}
      {decision.status && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              decision.status === 'open'
                ? 'bg-blue-500'
                : decision.status === 'in_review'
                  ? 'bg-amber-500'
                  : decision.status === 'decided'
                    ? 'bg-green-500'
                    : 'bg-gray-400'
            }`}
          />
          <span className="text-xs text-gray-500 capitalize">{decision.status.replace('_', ' ')}</span>
        </div>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-5 space-y-3">
      <div className="flex gap-2">
        <div className="h-5 w-20 bg-gray-200 rounded-full" />
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="h-5 w-3/4 bg-gray-200 rounded" />
      <div className="h-4 w-full bg-gray-200 rounded" />
      <div className="h-2 w-full bg-gray-200 rounded-full" />
      <div className="h-4 w-1/2 bg-gray-200 rounded" />
    </div>
  );
}

function EmptyState({
  onCreateFirst,
  onTypeClick,
}: {
  onCreateFirst: () => void;
  onTypeClick: (type: DecisionType) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Lightning icon */}
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-6">
        <svg
          className="w-8 h-8 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 mb-2">No decisions yet</h3>
      <p className="text-sm text-gray-500 text-center max-w-md mb-6">
        The Decision Support Engine helps you structure complex decisions with
        AI-powered analysis, option comparison, and pre-mortem thinking.
      </p>

      <button
        onClick={onCreateFirst}
        className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors mb-6"
      >
        + Create Your First Decision
      </button>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>Common decision types:</span>
        {(['strategic', 'hiring', 'vendor', 'financial'] as DecisionType[]).map(
          (type, i) => (
            <span key={type}>
              {i > 0 && <span className="mx-1">|</span>}
              <button
                onClick={() => onTypeClick(type)}
                className="text-blue-600 hover:text-blue-800 hover:underline capitalize"
              >
                {type}
              </button>
            </span>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DecisionHubPage() {
  // Data state
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [stats, setStats] = useState<DecisionStats>({ active: 0, pending: 0, decided: 0, thisMonth: 0 });
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // UI state
  const [showNewDecision, setShowNewDecision] = useState(false);
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<DecisionType>('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyLevel>('');
  const [sortBy, setSortBy] = useState<SortField>('date');

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities?page=1&pageSize=100');
      const json = await res.json();
      if (json.success && json.data) {
        setEntities(
          json.data.map((e: { id: string; name: string }) => ({
            id: e.id,
            name: e.name,
          }))
        );
      }
    } catch {
      // silently handle
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityFilter) params.set('entityId', entityFilter);
      const res = await fetch(`/api/decisions/stats?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
      }
    } catch {
      // silently handle
    } finally {
      setStatsLoading(false);
    }
  }, [entityFilter]);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    try {
      // If we have an entity filter, fetch from /api/decisions with entityId
      // Otherwise, try to fetch from all entities
      if (entityFilter) {
        const res = await fetch(
          `/api/decisions?entityId=${encodeURIComponent(entityFilter)}&page=1&pageSize=50`
        );
        const json = await res.json();
        if (json.success) {
          const entity = entities.find((e) => e.id === entityFilter);
          const items: DecisionItem[] = (json.data ?? []).map(
            (d: DecisionItem) => ({
              ...d,
              entityId: entityFilter,
              entityName: entity?.name ?? entityFilter,
            })
          );
          setDecisions(items);
        }
      } else if (entities.length > 0) {
        // Fetch briefs from all entities in parallel
        const allDecisions: DecisionItem[] = [];
        const fetches = entities.map(async (entity) => {
          try {
            const res = await fetch(
              `/api/decisions?entityId=${encodeURIComponent(entity.id)}&page=1&pageSize=50`
            );
            const json = await res.json();
            if (json.success && json.data) {
              return (json.data as DecisionItem[]).map((d) => ({
                ...d,
                entityId: entity.id,
                entityName: entity.name,
              }));
            }
          } catch {
            // silently handle per-entity fetch failure
          }
          return [];
        });
        const results = await Promise.all(fetches);
        results.forEach((r) => allDecisions.push(...r));
        setDecisions(allDecisions);
      } else {
        setDecisions([]);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [entityFilter, entities]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // ---------------------------------------------------------------------------
  // Filtering & sorting
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = [...decisions];

    // Status tab filter
    if (activeTab === 'active') {
      result = result.filter(
        (d) => d.status === 'open' || d.status === 'in_review' || !d.status
      );
    } else if (activeTab === 'pending') {
      result = result.filter((d) => d.status === 'in_review');
    } else if (activeTab === 'decided') {
      result = result.filter((d) => d.status === 'decided');
    } else if (activeTab === 'archived') {
      result = result.filter(
        (d) => d.status === 'deferred' || d.status === 'cancelled'
      );
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.recommendation ?? '').toLowerCase().includes(q) ||
          (d.description ?? '').toLowerCase().includes(q) ||
          (d.request?.description ?? '').toLowerCase().includes(q)
      );
    }

    // Type filter
    if (typeFilter) {
      result = result.filter((d) => d.type === typeFilter);
    }

    // Urgency filter
    if (urgencyFilter) {
      result = result.filter((d) => {
        const br = d.blastRadius ?? d.request?.blastRadius;
        return br === urgencyFilter;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'urgency': {
          const aUrgency = BLAST_ORDER[a.blastRadius ?? a.request?.blastRadius ?? 'LOW'] ?? 0;
          const bUrgency = BLAST_ORDER[b.blastRadius ?? b.request?.blastRadius ?? 'LOW'] ?? 0;
          return bUrgency - aUrgency;
        }
        case 'impact':
          return b.confidenceScore - a.confidenceScore;
        case 'deadline': {
          const aDeadline = a.deadline ?? a.request?.deadline;
          const bDeadline = b.deadline ?? b.request?.deadline;
          if (!aDeadline && !bDeadline) return 0;
          if (!aDeadline) return 1;
          if (!bDeadline) return -1;
          return new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
        }
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [decisions, activeTab, search, typeFilter, urgencyFilter, sortBy]);

  // Compute tab counts from local decisions
  const tabCounts = useMemo(() => {
    const active = decisions.filter(
      (d) => d.status === 'open' || d.status === 'in_review' || !d.status
    ).length;
    const pending = decisions.filter((d) => d.status === 'in_review').length;
    return { active, pending };
  }, [decisions]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCreate = async (data: {
    entityId: string;
    title: string;
    description: string;
    context: string;
    deadline?: string;
    stakeholders: string[];
    constraints: string[];
    blastRadius: BlastRadius;
  }) => {
    try {
      const res = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowNewDecision(false);
        fetchDecisions();
        fetchStats();
      }
    } catch {
      // silently handle
    }
  };

  const handleTypeClick = (type: DecisionType) => {
    setTypeFilter(type);
    setShowNewDecision(true);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ----------------------------------------------------------------- */}
      {/* PAGE HEADER                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Decision Support</h1>
          <p className="text-sm text-gray-500 mt-1">
            Structure your thinking. Make better decisions faster.
          </p>
        </div>
        <button
          onClick={() => setShowNewDecision(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + New Decision
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* STATS BAR                                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-6">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
              <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-7 w-10 bg-gray-200 rounded" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Active" value={stats.active} colorClass="text-blue-600" />
            <StatCard label="Pending" value={stats.pending} colorClass="text-amber-600" />
            <StatCard label="Decided" value={stats.decided} colorClass="text-green-600" />
            <StatCard label="This Month" value={stats.thisMonth} colorClass="text-gray-600" />
          </>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* NEW DECISION FORM                                                  */}
      {/* ----------------------------------------------------------------- */}
      {showNewDecision && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <NewDecisionForm
            onSubmit={handleCreate}
            onCancel={() => setShowNewDecision(false)}
            entityId={entityFilter || undefined}
          />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* STATUS TABS                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-6 -mb-px" aria-label="Decision status tabs">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count =
              tab.key === 'active'
                ? tabCounts.active
                : tab.key === 'pending'
                  ? tabCounts.pending
                  : undefined;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm transition-colors ${
                  isActive
                    ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                      isActive
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* FILTER BAR                                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decisions..."
            className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Entity dropdown */}
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[160px]"
        >
          <option value="">All Entities</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>

        {/* Type dropdown */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DecisionType)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {DECISION_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Urgency dropdown */}
        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value as UrgencyLevel)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {URGENCY_LEVELS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortField)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* LOADING SKELETONS                                                  */}
      {/* ----------------------------------------------------------------- */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* DECISIONS LIST                                                     */}
      {/* ----------------------------------------------------------------- */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              onClick={() => {
                window.location.href = `/decisions/${decision.id}`;
              }}
            />
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* EMPTY STATE                                                        */}
      {/* ----------------------------------------------------------------- */}
      {!loading && filtered.length === 0 && (
        <EmptyState
          onCreateFirst={() => setShowNewDecision(true)}
          onTypeClick={handleTypeClick}
        />
      )}
    </div>
  );
}
