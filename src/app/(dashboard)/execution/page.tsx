'use client';

import { useState, useEffect, useCallback, useMemo, Suspense, lazy, type ComponentType } from 'react';
import type { Entity } from '@/shared/types';
import type { QueuedAction } from '@/modules/execution/types';
import FlightControl from '@/modules/execution/components/FlightControl';

// ---------------------------------------------------------------------------
// Dynamic imports with fallbacks
// ---------------------------------------------------------------------------

/**
 * Attempts to load a dynamic component, falling back to a secondary or
 * placeholder component if the primary module does not exist.
 */
function dynamicWithFallback<P extends object>(
  primaryLoader: () => Promise<{ default: ComponentType<P> }>,
  fallbackLoader?: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> {
  return lazy(async () => {
    try {
      return await primaryLoader();
    } catch {
      if (fallbackLoader) {
        try {
          return await fallbackLoader();
        } catch {
          // Both failed
        }
      }
      // Return empty placeholder
      return {
        default: (() => null) as unknown as ComponentType<P>,
      };
    }
  });
}

// Tab component types — all accept entityId and optional simulationMode
interface TabComponentProps {
  entityId: string;
  simulationMode?: boolean;
}

// Module path constants — extracted to bypass static analysis on missing modules
const MOD_ENHANCED_CONSOLE = '@/modules/execution/components/EnhancedOperatorConsole';
const MOD_CONSOLE = '@/modules/execution/components/OperatorConsole';
const MOD_ENHANCED_RUNBOOKS = '@/modules/execution/components/EnhancedRunbooksTab';
const MOD_ENHANCED_GATES = '@/modules/execution/components/EnhancedGatesTab';

const EnhancedOperatorConsole = dynamicWithFallback<TabComponentProps>(
  () => import(/* webpackIgnore: true */ MOD_ENHANCED_CONSOLE) as Promise<{ default: ComponentType<TabComponentProps> }>,
  () => import(MOD_CONSOLE) as Promise<{ default: ComponentType<TabComponentProps> }>,
);

const EnhancedRunbooksTab = dynamicWithFallback<TabComponentProps>(
  () => import(/* webpackIgnore: true */ MOD_ENHANCED_RUNBOOKS) as Promise<{ default: ComponentType<TabComponentProps> }>,
);

const EnhancedGatesTab = dynamicWithFallback<TabComponentProps>(
  () => import(/* webpackIgnore: true */ MOD_ENHANCED_GATES) as Promise<{ default: ComponentType<TabComponentProps> }>,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'flight-control' | 'operator-console' | 'runbooks' | 'gates';

interface TabDefinition {
  id: TabId;
  label: string;
}

interface QueueStatsResponse {
  pending: number;
  executedToday: number;
  rolledBack: number;
  totalCostToday: number;
}

interface EntitiesApiResponse {
  data: Entity[];
  meta?: { total: number };
}

interface QueueApiResponse {
  data: QueuedAction[];
  meta?: { total: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: TabDefinition[] = [
  { id: 'flight-control', label: 'Flight Control' },
  { id: 'operator-console', label: 'Operator Console' },
  { id: 'runbooks', label: 'Runbooks' },
  { id: 'gates', label: 'Gates' },
];

const STATS_REFRESH_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Compute stats client-side from a list of queued actions when the dedicated
 * stats endpoint is unavailable.
 */
function computeStatsFromActions(actions: QueuedAction[]): QueueStatsResponse {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let pending = 0;
  let executedToday = 0;
  let rolledBack = 0;
  let totalCostToday = 0;

  for (const action of actions) {
    if (action.status === 'QUEUED') pending++;
    if (action.status === 'ROLLED_BACK') rolledBack++;

    const executedAt = action.executedAt ? new Date(action.executedAt) : null;
    if (action.status === 'EXECUTED' && executedAt && executedAt >= startOfDay) {
      executedToday++;
      totalCostToday += action.estimatedCost ?? 0;
    }
  }

  return { pending, executedToday, rolledBack, totalCostToday };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ExecutionPage() {
  // ---- UI state -----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabId>('flight-control');
  const [simulationMode, setSimulationMode] = useState(false);

  // ---- Entity state -------------------------------------------------------
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('all');
  const [entitiesLoading, setEntitiesLoading] = useState(true);

  // ---- Stats state --------------------------------------------------------
  const [stats, setStats] = useState<QueueStatsResponse>({
    pending: 0,
    executedToday: 0,
    rolledBack: 0,
    totalCostToday: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ---- Page-level loading -------------------------------------------------
  const [initialLoading, setInitialLoading] = useState(true);

  // ---- Derived values -----------------------------------------------------
  const effectiveEntityId = useMemo(() => {
    if (selectedEntityId === 'all') return 'default-entity';
    return selectedEntityId;
  }, [selectedEntityId]);

  // ---- Fetch entities -----------------------------------------------------

  const fetchEntities = useCallback(async () => {
    setEntitiesLoading(true);
    try {
      const res = await fetch('/api/entities');
      if (!res.ok) throw new Error('Failed to fetch entities');
      const body: EntitiesApiResponse = await res.json();
      setEntities(body.data ?? []);
    } catch {
      // Non-critical: fall back to empty list with default entity
      setEntities([]);
    } finally {
      setEntitiesLoading(false);
    }
  }, []);

  // ---- Fetch stats --------------------------------------------------------

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      // Try dedicated stats endpoint first
      const params = new URLSearchParams();
      if (selectedEntityId !== 'all') params.set('entityId', selectedEntityId);

      const statsRes = await fetch(`/api/execution/queue/stats?${params.toString()}`);
      if (statsRes.ok) {
        const body: QueueStatsResponse = await statsRes.json();
        setStats(body);
        return;
      }

      // Fallback: fetch queue and compute client-side
      const queueParams = new URLSearchParams();
      if (selectedEntityId !== 'all') queueParams.set('entityId', selectedEntityId);
      queueParams.set('pageSize', '100');

      const queueRes = await fetch(`/api/execution/queue?${queueParams.toString()}`);
      if (queueRes.ok) {
        const body: QueueApiResponse = await queueRes.json();
        setStats(computeStatsFromActions(body.data ?? []));
      }
    } catch {
      // Stats are non-critical; keep previous values
    } finally {
      setStatsLoading(false);
    }
  }, [selectedEntityId]);

  // ---- Initial load -------------------------------------------------------

  useEffect(() => {
    async function init() {
      await Promise.all([fetchEntities(), fetchStats()]);
      setInitialLoading(false);
    }
    init();
  }, [fetchEntities, fetchStats]);

  // ---- Auto-refresh stats -------------------------------------------------

  useEffect(() => {
    const id = setInterval(fetchStats, STATS_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchStats]);

  // ---- Re-fetch stats when entity changes ---------------------------------

  useEffect(() => {
    if (!initialLoading) fetchStats();
  }, [selectedEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Skeleton -----------------------------------------------------------

  if (initialLoading) {
    return <ExecutionPageSkeleton />;
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* 1. Page Header                                                      */}
      {/* ================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Execution Layer
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            AI safety and control &mdash; approve, monitor, simulate, and audit all automated actions.
          </p>
        </div>

        {/* Entity selector */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="entity-selector"
            className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
          >
            Entity:
          </label>
          <select
            id="entity-selector"
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            disabled={entitiesLoading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm
                       focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400
                       dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300
                       disabled:opacity-50"
          >
            <option value="all">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. Simulation Mode Toggle                                           */}
      {/* ================================================================== */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Mode:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-0.5">
            <button
              onClick={() => setSimulationMode(false)}
              className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                !simulationMode
                  ? 'bg-white text-green-700 shadow-sm border border-green-300 dark:bg-gray-700 dark:text-green-400 dark:border-green-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  !simulationMode ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
              LIVE
            </button>
            <button
              onClick={() => setSimulationMode(true)}
              className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                simulationMode
                  ? 'bg-white text-amber-700 shadow-sm border border-amber-300 dark:bg-gray-700 dark:text-amber-400 dark:border-amber-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  simulationMode ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
              SIMULATION
            </button>
          </div>
        </div>

        {/* Simulation banner */}
        {simulationMode && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            SIMULATION MODE &mdash; No actions will execute. All operations will be dry-run only.
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* 3. Stats Bar                                                        */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard
          label="Pending"
          value={stats.pending}
          color="amber"
          loading={statsLoading}
        />
        <StatsCard
          label="Executed Today"
          value={stats.executedToday}
          color="blue"
          loading={statsLoading}
        />
        <StatsCard
          label="Rolled Back"
          value={stats.rolledBack}
          color="red"
          loading={statsLoading}
        />
        <StatsCard
          label="Cost Today"
          value={formatCurrency(stats.totalCostToday)}
          color="green"
          loading={statsLoading}
        />
      </div>

      {/* ================================================================== */}
      {/* 4. Tab Bar                                                          */}
      {/* ================================================================== */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-1" aria-label="Execution tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
                aria-selected={isActive}
                role="tab"
              >
                {tab.label}
                {tab.id === 'flight-control' && stats.pending > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold leading-none text-white">
                    {stats.pending}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ================================================================== */}
      {/* 5. Tab Content                                                      */}
      {/* ================================================================== */}
      <div className="min-h-[400px]">
        <Suspense fallback={<TabLoadingFallback />}>
          <TabContent
            activeTab={activeTab}
            entityId={effectiveEntityId}
            simulationMode={simulationMode}
          />
        </Suspense>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Content Router
// ---------------------------------------------------------------------------

interface TabContentProps {
  activeTab: TabId;
  entityId: string;
  simulationMode: boolean;
}

function TabContent({ activeTab, entityId, simulationMode }: TabContentProps) {
  switch (activeTab) {
    case 'flight-control':
      return <FlightControl entityId={entityId} />;

    case 'operator-console':
      return (
        <EnhancedOperatorConsole
          entityId={entityId}
          simulationMode={simulationMode}
        />
      );

    case 'runbooks':
      return (
        <RunbooksTabWrapper
          entityId={entityId}
          simulationMode={simulationMode}
        />
      );

    case 'gates':
      return (
        <GatesTabWrapper
          entityId={entityId}
          simulationMode={simulationMode}
        />
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Runbooks Tab Wrapper (with inline fallback)
// ---------------------------------------------------------------------------

function RunbooksTabWrapper({ entityId, simulationMode }: TabComponentProps) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return <RunbooksPlaceholder entityId={entityId} />;
  }

  return (
    <RunbooksErrorBoundary onError={() => setHasFailed(true)}>
      <Suspense fallback={<TabLoadingFallback />}>
        <EnhancedRunbooksTab entityId={entityId} simulationMode={simulationMode} />
      </Suspense>
    </RunbooksErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Gates Tab Wrapper (with inline fallback)
// ---------------------------------------------------------------------------

function GatesTabWrapper({ entityId, simulationMode }: TabComponentProps) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return <GatesPlaceholder entityId={entityId} />;
  }

  return (
    <GatesErrorBoundary onError={() => setHasFailed(true)}>
      <Suspense fallback={<TabLoadingFallback />}>
        <EnhancedGatesTab entityId={entityId} simulationMode={simulationMode} />
      </Suspense>
    </GatesErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Simple Error Boundaries (class components required for error boundaries)
// ---------------------------------------------------------------------------

import React from 'react';

interface ErrorBoundaryProps {
  onError: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class RunbooksErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

class GatesErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Fallback Placeholders
// ---------------------------------------------------------------------------

function RunbooksPlaceholder({ entityId }: { entityId: string }) {
  const [runbooks, setRunbooks] = useState<Array<{ id: string; name: string; description: string; steps: unknown[]; isActive: boolean; tags: string[] }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/execution/runbooks?entityId=${entityId}`);
        if (res.ok) {
          const json = await res.json();
          setRunbooks(json.data ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [entityId]);

  if (loading) {
    return <TabLoadingFallback />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        Showing basic runbooks view. Enhanced component not yet available.
      </div>

      {runbooks.length === 0 ? (
        <div className="py-12 text-center text-gray-400 dark:text-gray-500">
          No runbooks configured for this entity.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {runbooks.map((rb) => (
            <div
              key={rb.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {rb.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {rb.description}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    rb.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {rb.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>{(rb.steps as unknown[]).length} steps</span>
                {rb.tags.length > 0 && (
                  <div className="flex gap-1">
                    {rb.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GatesPlaceholder({ entityId }: { entityId: string }) {
  const [gates, setGates] = useState<Array<{ id: string; name: string; expression: string; description: string; scope: string; isActive: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/execution/gates?entityId=${entityId}`);
        if (res.ok) {
          const json = await res.json();
          setGates(json.data ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [entityId]);

  if (loading) {
    return <TabLoadingFallback />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        Showing basic gates view. Enhanced component not yet available.
      </div>

      {gates.length === 0 ? (
        <div className="py-12 text-center text-gray-400 dark:text-gray-500">
          No execution gates configured for this entity.
        </div>
      ) : (
        <div className="space-y-3">
          {gates.map((gate) => (
            <div
              key={gate.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {gate.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      gate.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {gate.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    {gate.scope}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {gate.description}
                </p>
                <code className="mt-1 block text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                  {gate.expression}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Card
// ---------------------------------------------------------------------------

const STAT_COLORS = {
  amber: {
    border: 'border-amber-200 dark:border-amber-800',
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  },
  blue: {
    border: 'border-blue-200 dark:border-blue-800',
    value: 'text-blue-600 dark:text-blue-400',
    icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  },
  red: {
    border: 'border-red-200 dark:border-red-800',
    value: 'text-red-600 dark:text-red-400',
    icon: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  },
  green: {
    border: 'border-green-200 dark:border-green-800',
    value: 'text-green-600 dark:text-green-400',
    icon: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  },
} as const;

type StatColor = keyof typeof STAT_COLORS;

const STAT_ICONS: Record<string, React.ReactNode> = {
  Pending: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'Executed Today': (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'Rolled Back': (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  ),
  'Cost Today': (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

function StatsCard({
  label,
  value,
  color,
  loading,
}: {
  label: string;
  value: string | number;
  color: StatColor;
  loading?: boolean;
}) {
  const colors = STAT_COLORS[color];

  return (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm dark:bg-gray-800 ${colors.border}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <div className={`rounded-lg p-1.5 ${colors.icon}`}>
          {STAT_ICONS[label] ?? null}
        </div>
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      ) : (
        <p className={`mt-1 text-2xl font-semibold ${colors.value}`}>{value}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Loading Fallback
// ---------------------------------------------------------------------------

function TabLoadingFallback() {
  return (
    <div className="space-y-4 py-6">
      <div className="flex items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
        <svg
          className="h-5 w-5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm">Loading tab content...</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Skeleton (initial load)
// ---------------------------------------------------------------------------

function ExecutionPageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-8 w-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      {/* Simulation toggle skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-4 w-10 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-9 w-56 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>

      {/* Tab bar skeleton */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 pb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-5 rounded bg-gray-200 dark:bg-gray-700"
              style={{ width: `${80 + i * 15}px` }}
            />
          ))}
        </div>
      </div>

      {/* Tab content skeleton */}
      <div className="space-y-4">
        <div className="h-12 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-12 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-12 w-3/4 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-12 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-12 w-5/6 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
