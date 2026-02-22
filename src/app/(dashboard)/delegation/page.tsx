'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'inbox' | 'active' | 'scoreboard';

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

interface DelegationStats {
  activeDelegated: number;
  completedThisWeek: number;
  timeSavedHours: number;
  pendingApproval: number;
}

// ---------------------------------------------------------------------------
// Default Stats
// ---------------------------------------------------------------------------

const DEFAULT_STATS: DelegationStats = {
  activeDelegated: 0,
  completedThisWeek: 0,
  timeSavedHours: 0,
  pendingApproval: 0,
};

// ---------------------------------------------------------------------------
// Dynamic Imports with Graceful Fallbacks
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const EnhancedDelegationInbox: any = dynamic(
  () =>
    import('@/modules/delegation/components/EnhancedDelegationInbox').catch(
      () => import('@/modules/delegation/components/DelegationInbox')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Delegation Inbox" />,
  }
);

const ActiveDelegationsTab: any = dynamic(
  () =>
    import('@/modules/delegation/components/ActiveDelegationsTab').catch(() => ({
      default: ActiveDelegationsTabFallback,
    })) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Active Delegations" />,
  }
);

const EnhancedScoreboard: any = dynamic(
  () =>
    import('@/modules/delegation/components/EnhancedScoreboard').catch(
      () => import('@/modules/delegation/components/DelegationScoring')
    ) as any,
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Scoreboard" />,
  }
);

const DelegateTaskModal: any = dynamic(
  () =>
    import('@/modules/delegation/components/DelegateTaskModal').catch(() => ({
      default: DelegateTaskModalFallback,
    })) as any,
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-xl p-8 shadow-lg animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-64 mb-2" />
          <div className="h-4 bg-gray-100 rounded w-56" />
        </div>
      </div>
    ),
  }
);

// ---------------------------------------------------------------------------
// Loading Skeleton Components
// ---------------------------------------------------------------------------

function TabLoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-5 w-5 bg-gray-200 rounded" />
        <div className="h-5 bg-gray-200 rounded w-40" />
      </div>
      <div className="space-y-4">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-10 bg-gray-100 rounded w-48 mt-4" />
      </div>
      <p className="sr-only">Loading {label}...</p>
    </div>
  );
}

function StatsBarSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
        >
          <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
          <div className="h-7 bg-gray-200 rounded w-12" />
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-96 mb-4" />
        <div className="h-10 bg-gray-100 rounded w-48" />
      </div>
      <StatsBarSkeleton />
      <div className="border-b border-gray-200 animate-pulse">
        <div className="flex gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded w-32 mb-3" />
          ))}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
        <div className="space-y-4">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
          <div className="h-32 bg-gray-50 rounded w-full mt-4" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
  bold = false,
  suffix,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  suffix?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <span
        className={`text-2xl ${bold ? 'font-bold' : 'font-semibold'} ${color}`}
      >
        {value}
        {suffix && (
          <span className="text-sm font-normal ml-0.5">{suffix}</span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Fallback Components
// ---------------------------------------------------------------------------

function ActiveDelegationsTabFallback({
  entityId,
}: {
  entityId?: string;
  onRefreshStats?: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Active Delegations
      </h3>
      <div className="text-center py-12">
        <svg
          className="mx-auto h-10 w-10 text-gray-300 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.5a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
          />
        </svg>
        <p className="text-sm text-gray-500">
          No active delegations{entityId ? ' for this entity' : ''}.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Delegate tasks from the Inbox tab to see them tracked here.
        </p>
      </div>
    </div>
  );
}

function DelegateTaskModalFallback({
  onClose,
}: {
  entityId?: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl p-6 shadow-lg max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Delegate a Task
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">
            Task delegation form coming soon.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Use the Inbox tab to delegate AI-suggested tasks in the meantime.
          </p>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Definitions
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'inbox',
    label: 'Delegation Inbox',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.5 0V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 0113.548 0c1.131.094 1.976 1.057 1.976 2.192V13.5M2.25 13.5V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.5" />
      </svg>
    ),
  },
  {
    key: 'active',
    label: 'Active Delegations',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    key: 'scoreboard',
    label: 'Scoreboard',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.52.587 6.023 6.023 0 01-2.52-.587" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function DelegationPage() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [stats, setStats] = useState<DelegationStats>(DEFAULT_STATS);
  const [pageLoading, setPageLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  // --- Fetch Entities ---
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities').catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const entityList: EntityOption[] = (data.data ?? []).map(
            (e: { id: string; name: string; type?: string }) => ({
              id: e.id,
              name: e.name,
              type: e.type ?? 'Unknown',
            })
          );
          setEntities(entityList);
        }
      } catch (err) {
        console.error('Failed to fetch entities:', err);
      } finally {
        setPageLoading(false);
      }
    }
    fetchEntities();
  }, []);

  // --- Fetch Stats (re-fetches when entity changes) ---
  const fetchStats = useCallback(async (entityId: string) => {
    setStatsLoading(true);
    try {
      const params = entityId ? `?entityId=${entityId}` : '';
      const res = await fetch(
        `/api/delegation/stats${params}`
      ).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setStats({
          activeDelegated: data.data?.activeDelegated ?? 0,
          completedThisWeek: data.data?.completedThisWeek ?? 0,
          timeSavedHours: data.data?.timeSavedHours ?? 0,
          pendingApproval: data.data?.pendingApproval ?? 0,
        });
      } else {
        setStats(DEFAULT_STATS);
      }
    } catch (err) {
      console.error('Failed to fetch delegation stats:', err);
      setStats(DEFAULT_STATS);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pageLoading) {
      fetchStats(selectedEntityId);
    }
  }, [selectedEntityId, pageLoading, fetchStats]);

  // --- Refresh stats callback for child components ---
  const handleRefreshStats = useCallback(() => {
    fetchStats(selectedEntityId);
  }, [fetchStats, selectedEntityId]);

  // --- Entity ID to pass to tabs ---
  const entityIdProp = selectedEntityId || undefined;

  // --- Render tab content ---
  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'inbox':
        return (
          <EnhancedDelegationInbox
            entityId={entityIdProp}
            onDelegated={handleRefreshStats}
          />
        );
      case 'active':
        return (
          <ActiveDelegationsTab
            entityId={entityIdProp}
            onRefreshStats={handleRefreshStats}
          />
        );
      case 'scoreboard':
        return (
          <EnhancedScoreboard
            entityId={entityIdProp}
          />
        );
      default:
        return null;
    }
  }, [activeTab, entityIdProp, handleRefreshStats]);

  // --- Page Loading State ---
  if (pageLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delegation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Free up your focus time. AI identifies tasks you can hand off and
            tracks delegate performance.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label
              htmlFor="delegation-entity-select"
              className="text-sm font-medium text-gray-700 whitespace-nowrap"
            >
              Entity:
            </label>
            <select
              id="delegation-entity-select"
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
            >
              <option value="">All Entities</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                  {entity.type ? ` (${entity.type})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowDelegateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Delegate Task
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {statsLoading ? (
        <StatsBarSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Delegated"
            value={stats.activeDelegated}
            color="text-blue-600"
            bold={stats.activeDelegated > 0}
          />
          <StatCard
            label="Completed This Week"
            value={stats.completedThisWeek}
            color="text-green-600"
          />
          <StatCard
            label="Time Saved This Week"
            value={stats.timeSavedHours}
            color="text-purple-600"
            suffix="hrs"
          />
          <StatCard
            label="Pending Approval"
            value={stats.pendingApproval}
            color="text-amber-600"
            bold={stats.pendingApproval > 0}
          />
        </div>
      )}

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span
                  className={
                    isActive ? 'text-blue-600' : 'text-gray-400'
                  }
                >
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={activeTab}
      >
        {tabContent}
      </div>

      {/* Delegate Task Modal */}
      {showDelegateModal && (
        <DelegateTaskModal
          isOpen={showDelegateModal}
          onClose={() => setShowDelegateModal(false)}
          onDelegated={() => {
            setShowDelegateModal(false);
            handleRefreshStats();
          }}
        />
      )}
    </div>
  );
}
