'use client';

import { useEffect, useState, useMemo, type ReactNode } from 'react';

// -- Existing component imports (used as fallbacks) --------------------------
import TimeSavedDisplay from '@/modules/analytics/components/TimeSavedDisplay';
import ProductivityScoreCard from '@/modules/analytics/components/ProductivityScoreCard';
import TimeAuditChart from '@/modules/analytics/components/TimeAuditChart';
import DriftAlertBanner from '@/modules/analytics/components/DriftAlertBanner';
import GoalList from '@/modules/analytics/components/GoalList';
import LLMCostChart from '@/modules/analytics/components/LLMCostChart';
import CallAnalyticsPanel from '@/modules/analytics/components/CallAnalyticsPanel';
import HabitTracker from '@/modules/analytics/components/HabitTracker';

import type {
  TimeSavedAggregate,
  ProductivityScore,
  TimeAuditReport,
  GoalDefinition,
  LLMCostDashboard,
  CallAnalytics,
  HabitDefinition,
  DriftAlert,
} from '@/modules/analytics/types';

// -- Types -------------------------------------------------------------------
type PeriodKey = 'this_week' | 'this_month' | 'this_quarter' | 'this_year';
type TabKey = 'overview' | 'goals' | 'habits' | 'ai_costs' | 'calls' | 'time_saved';

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'goals', label: 'Goals' },
  { key: 'habits', label: 'Habits' },
  { key: 'ai_costs', label: 'AI Costs' },
  { key: 'calls', label: 'Calls' },
  { key: 'time_saved', label: 'Time Saved' },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
];

// -- Dynamic enhanced component loader hook ----------------------------------
function useEnhancedComponent<P>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
): { Component: React.ComponentType<P> | null; loaded: boolean } {
  const [Component, setComponent] = useState<React.ComponentType<P> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    importFn()
      .then((mod) => {
        if (!cancelled) {
          setComponent(() => mod.default);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { Component, loaded };
}

// -- Error boundary wrapper ---------------------------------------------------
function SafeRender({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  try {
    return <>{children}</>;
  } catch {
    return <>{fallback ?? <EmptyCard message="Something went wrong rendering this section." />}</>;
  }
}

function EmptyCard({ message, className }: { message: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-6 ${className ?? ''}`}>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

// -- Demo / fallback data -----------------------------------------------------
const demoTimeSaved: TimeSavedAggregate = {
  userId: 'demo',
  totalMinutesSaved: 847,
  bySource: [
    { source: 'Email Drafts', minutes: 320 },
    { source: 'Task Automation', minutes: 280 },
    { source: 'Meeting Prep', minutes: 147 },
    { source: 'Research', minutes: 100 },
  ],
  dailyTrend: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-02-${String(i + 1).padStart(2, '0')}`,
    minutes: 40 + Math.floor(Math.random() * 30),
  })),
};

const demoProductivity: ProductivityScore = {
  userId: 'demo',
  date: new Date().toISOString().split('T')[0],
  overallScore: 78,
  dimensions: {
    highPriorityCompletion: 85,
    focusTimeAchieved: 72,
    goalProgress: 68,
    meetingEfficiency: 90,
    communicationSpeed: 80,
  },
  trend: 'IMPROVING',
};

const demoTimeAudit: TimeAuditReport = {
  userId: 'demo',
  periodStart: new Date('2026-02-10'),
  periodEnd: new Date('2026-02-15'),
  entries: [
    { date: '2026-02-15', category: 'deep_work', intendedMinutes: 240, actualMinutes: 180, driftMinutes: -60, driftPercent: 25 },
    { date: '2026-02-15', category: 'meetings', intendedMinutes: 120, actualMinutes: 180, driftMinutes: 60, driftPercent: 50 },
    { date: '2026-02-15', category: 'email', intendedMinutes: 60, actualMinutes: 75, driftMinutes: 15, driftPercent: 25 },
    { date: '2026-02-15', category: 'admin', intendedMinutes: 60, actualMinutes: 45, driftMinutes: -15, driftPercent: 25 },
  ],
  totalDriftMinutes: 150,
  worstDriftCategory: 'meetings',
  alerts: [
    { category: 'meetings', message: 'Critical drift in meetings: 50% deviation from plan', severity: 'CRITICAL', suggestedAction: 'Review and restructure meetings time allocation.' },
    { category: 'deep_work', message: 'Warning: deep_work drifted 25% from intended allocation', severity: 'WARNING', suggestedAction: 'Monitor deep_work time more closely.' },
  ],
};

const demoGoals: GoalDefinition[] = [
  {
    id: '1', userId: 'demo', title: 'Ship v2.0 Release', framework: 'OKR',
    targetValue: 100, currentValue: 65, unit: '%', milestones: [],
    startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'),
    status: 'ON_TRACK', autoProgress: true, linkedTaskIds: [], linkedWorkflowIds: [],
  },
  {
    id: '2', userId: 'demo', title: 'Reduce response time to < 2h', framework: 'SMART',
    targetValue: 120, currentValue: 85, unit: 'min', milestones: [],
    startDate: new Date('2026-02-01'), endDate: new Date('2026-02-28'),
    status: 'AT_RISK', autoProgress: false, linkedTaskIds: [], linkedWorkflowIds: [],
  },
];

const demoCosts: LLMCostDashboard = {
  entityId: 'demo', period: '2026-02', totalCostUsd: 187.45,
  byFeature: [
    { feature: 'Email Drafts', cost: 72.30, tokenCount: 7230000 },
    { feature: 'Triage', cost: 45.10, tokenCount: 4510000 },
    { feature: 'Research', cost: 38.25, tokenCount: 3825000 },
    { feature: 'Automation', cost: 31.80, tokenCount: 3180000 },
  ],
  budgetCapUsd: 500, percentUsed: 37.49, projectedMonthEnd: 374.90, alerts: [],
};

const demoCalls: CallAnalytics = {
  entityId: 'demo', period: '2026-02', totalCalls: 156,
  connectRate: 68, averageDuration: 420, sentimentAverage: 0.45,
  outcomeDistribution: { CONNECTED: 106, VOICEMAIL: 25, NO_ANSWER: 15, CALLBACK_REQUESTED: 10 },
  roiPerCallType: [
    { callType: 'OUTBOUND', averageRevenue: 125, averageCost: 42, roi: 198 },
    { callType: 'INBOUND', averageRevenue: 85, averageCost: 35, roi: 143 },
  ],
  insights: [],
};

const demoHabits: HabitDefinition[] = [
  {
    id: '1', userId: 'demo', name: 'Morning Exercise', frequency: 'DAILY',
    streak: 12, longestStreak: 21, successRate: 0.78,
    completionHistory: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
      completed: Math.random() > 0.22,
    })),
    correlations: [
      { habitName: 'Morning Exercise', metric: 'productivity_score', correlationCoefficient: 0.72, description: 'Morning exercise correlates with 12% higher productivity' },
    ],
  },
  {
    id: '2', userId: 'demo', name: 'Deep Work Block', frequency: 'WEEKDAY',
    streak: 5, longestStreak: 15, successRate: 0.65,
    completionHistory: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
      completed: Math.random() > 0.35,
    })),
    correlations: [
      { habitName: 'Deep Work Block', metric: 'focus_time', correlationCoefficient: 0.85, description: 'Deep work blocks correlate with 24% more focus time' },
    ],
  },
  {
    id: '3', userId: 'demo', name: 'End-of-Day Review', frequency: 'DAILY',
    streak: 8, longestStreak: 30, successRate: 0.82,
    completionHistory: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
      completed: Math.random() > 0.18,
    })),
    correlations: [
      { habitName: 'End-of-Day Review', metric: 'goal_progress', correlationCoefficient: 0.61, description: 'End-of-day review correlates with better weekly goal completion' },
    ],
  },
];

// -- Helpers ------------------------------------------------------------------
function getPeriodRange(period: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  switch (period) {
    case 'this_week':
      start.setDate(now.getDate() - now.getDay());
      break;
    case 'this_month':
      start.setDate(1);
      break;
    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(qMonth, 1);
      break;
    }
    case 'this_year':
      start.setMonth(0, 1);
      break;
  }

  return { start, end };
}

// -- Loading skeleton ---------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-40 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-40 rounded-lg bg-gray-200" />
          <div className="h-10 w-40 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-10 w-24 rounded-t bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-48 rounded-lg bg-gray-100" />
        <div className="h-48 rounded-lg bg-gray-100" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="col-span-2 h-64 rounded-lg bg-gray-100" />
        <div className="h-64 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

// -- Safe inline Overview tab (crash-proof fallback) --------------------------
function SafeOverviewFallback({
  timeSaved,
  productivity,
  timeAudit,
}: {
  timeSaved: TimeSavedAggregate | null;
  productivity: ProductivityScore | null;
  timeAudit: TimeAuditReport | null;
}) {
  const ts = timeSaved ?? demoTimeSaved;
  const prod = productivity ?? demoProductivity;
  const audit = timeAudit ?? demoTimeAudit;
  const safeAlerts: DriftAlert[] = audit?.alerts ?? [];

  return (
    <div className="space-y-6">
      {/* Hero Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-1 text-sm font-medium uppercase text-gray-400">Time Saved by AI</h3>
          <p className="text-4xl font-bold text-green-600">
            {Math.floor((ts?.totalMinutesSaved ?? 0) / 60)}h {(ts?.totalMinutesSaved ?? 0) % 60}m
          </p>
          <p className="text-sm text-gray-500">total minutes saved</p>
          {(ts?.bySource ?? []).length > 0 && (
            <div className="mt-4 space-y-2">
              {(ts?.bySource ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{s?.source ?? 'Unknown'}</span>
                  <span className="font-medium text-gray-900">{s?.minutes ?? 0}m</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-1 text-sm font-medium uppercase text-gray-400">Productivity Score</h3>
          <p className="text-4xl font-bold text-blue-600">{prod?.overallScore ?? 0}</p>
          <p className="text-sm text-gray-500">
            Trend: {prod?.trend ?? 'N/A'}
          </p>
          <div className="mt-4 space-y-2">
            {Object.entries(prod?.dimensions ?? {}).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(Number(val) || 0, 100)}%` }}
                    />
                  </div>
                  <span className="font-medium text-gray-900 w-8 text-right">{val ?? 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Time Audit Row */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Time Audit</h3>
          {(audit?.entries ?? []).length > 0 ? (
            <div className="space-y-3">
              {(audit?.entries ?? []).map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 capitalize w-24">{entry?.category ?? 'N/A'}</span>
                  <div className="flex gap-6">
                    <span>Intended: {entry?.intendedMinutes ?? 0}m</span>
                    <span>Actual: {entry?.actualMinutes ?? 0}m</span>
                    <span className={`font-medium ${(entry?.driftMinutes ?? 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {(entry?.driftMinutes ?? 0) > 0 ? '+' : ''}{entry?.driftMinutes ?? 0}m
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No time audit data available.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Drift Alerts</h3>
          {safeAlerts.length > 0 ? (
            <div className="space-y-3">
              {safeAlerts.map((alert, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 text-sm ${
                    alert?.severity === 'CRITICAL'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : alert?.severity === 'WARNING'
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  <p className="font-medium">{alert?.category ?? 'Unknown'}</p>
                  <p className="mt-1">{alert?.message ?? ''}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No drift alerts.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Safe inline Habits tab (fallback) ----------------------------------------
function SafeHabitsFallback({ habits }: { habits: HabitDefinition[] }) {
  const safeHabits = habits ?? [];

  if (safeHabits.length === 0) {
    return <EmptyCard message="No habits tracked yet. Set up habits to see analytics here." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-blue-600">{safeHabits.length}</p>
          <p className="text-sm text-gray-500">Active Habits</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-green-600">
            {Math.max(...safeHabits.map((h) => h?.streak ?? 0), 0)}
          </p>
          <p className="text-sm text-gray-500">Best Current Streak</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-purple-600">
            {safeHabits.length > 0
              ? Math.round(safeHabits.reduce((sum, h) => sum + (h?.successRate ?? 0), 0) / safeHabits.length * 100)
              : 0}%
          </p>
          <p className="text-sm text-gray-500">Avg Success Rate</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {safeHabits.map((habit) => (
          <HabitTracker key={habit?.id ?? Math.random()} habit={habit} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// -- Main Page Component ------------------------------------------------------
// =============================================================================
export default function AnalyticsPage() {
  // -- State ------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [entity, setEntity] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodKey>('this_month');

  const [timeSaved, setTimeSaved] = useState<TimeSavedAggregate | null>(null);
  const [productivity, setProductivity] = useState<ProductivityScore | null>(null);
  const [timeAudit, setTimeAudit] = useState<TimeAuditReport | null>(null);
  const [goals, setGoals] = useState<GoalDefinition[] | null>(null);
  const [costs, setCosts] = useState<LLMCostDashboard | null>(null);
  const [calls, setCalls] = useState<CallAnalytics | null>(null);
  const [habits, setHabits] = useState<HabitDefinition[] | null>(null);
  const [loading, setLoading] = useState(true);

  // -- Dynamic enhanced components --------------------------------------------
  const enhancedOverview = useEnhancedComponent<{
    entity: string; period: PeriodKey;
    timeSaved: TimeSavedAggregate | null;
    productivity: ProductivityScore | null;
    timeAudit: TimeAuditReport | null;
  }>(() => import('@/modules/analytics/components/EnhancedOverviewTab'));

  const enhancedGoals = useEnhancedComponent<{
    entity: string; period: PeriodKey; goals: GoalDefinition[];
  }>(() => import('@/modules/analytics/components/EnhancedGoalsTab'));

  const enhancedHabits = useEnhancedComponent<{
    entity: string; period: PeriodKey; habits: HabitDefinition[];
  }>(() => import('@/modules/analytics/components/EnhancedHabitsTab'));

  const enhancedAICosts = useEnhancedComponent<{
    entity: string; period: PeriodKey; dashboard: LLMCostDashboard;
  }>(() => import('@/modules/analytics/components/EnhancedAICostsTab'));

  const enhancedCalls = useEnhancedComponent<{
    entity: string; period: PeriodKey; analytics: CallAnalytics;
  }>(() => import('@/modules/analytics/components/EnhancedCallsTab'));

  const enhancedTimeSaved = useEnhancedComponent<{
    entity: string; period: PeriodKey; aggregate: TimeSavedAggregate;
  }>(() => import('@/modules/analytics/components/TimeSavedTab'));

  // -- Entity list ------------------------------------------------------------
  const entities = useMemo(() => [
    { id: 'all', label: 'All Entities' },
    { id: 'personal', label: 'Personal' },
    { id: 'work', label: 'Work' },
  ], []);

  // -- Data fetching ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const { start, end } = getPeriodRange(period);
        const entityParam = entity === 'all' ? 'default' : entity;
        const periodStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

        const results = await Promise.allSettled([
          fetch('/api/analytics/productivity').then((r) => r.json()),
          fetch(`/api/analytics/time-audit?start=${start.toISOString()}&end=${end.toISOString()}`).then((r) => r.json()),
          fetch('/api/analytics/goals').then((r) => r.json()),
          fetch(`/api/analytics/llm-costs?entityId=${entityParam}&period=${periodStr}`).then((r) => r.json()),
          fetch(`/api/analytics/call-analytics?entityId=${entityParam}&start=${start.toISOString()}&end=${end.toISOString()}`).then((r) => r.json()),
          fetch('/api/analytics/time-saved').then((r) => r.json()),
          fetch('/api/analytics/habits').then((r) => r.json()).catch(() => ({ data: null })),
        ]);

        if (cancelled) return;

        if (results[0]?.status === 'fulfilled' && results[0]?.value?.data) {
          setProductivity(results[0].value.data);
        }
        if (results[1]?.status === 'fulfilled' && results[1]?.value?.data) {
          setTimeAudit(results[1].value.data);
        }
        if (results[2]?.status === 'fulfilled' && results[2]?.value?.data) {
          setGoals(results[2].value.data);
        }
        if (results[3]?.status === 'fulfilled' && results[3]?.value?.data) {
          setCosts(results[3].value.data);
        }
        if (results[4]?.status === 'fulfilled' && results[4]?.value?.data) {
          setCalls(results[4].value.data);
        }
        if (results[5]?.status === 'fulfilled' && results[5]?.value?.data) {
          setTimeSaved(results[5].value.data);
        }
        if (results[6]?.status === 'fulfilled' && results[6]?.value?.data) {
          setHabits(results[6].value.data);
        }
      } catch {
        // Silent fail - each section has its own fallback data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [entity, period]);

  // -- Resolved data with fallbacks -------------------------------------------
  const timeSavedData = timeSaved ?? demoTimeSaved;
  const goalsData = goals ?? demoGoals;
  const costsData = costs ?? demoCosts;
  const callsData = calls ?? demoCalls;
  const habitsData = habits ?? demoHabits;

  // -- Loading state ----------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Track performance, costs, and productivity insights</p>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // -- Tab content renderer ---------------------------------------------------
  function renderTab(): ReactNode {
    try {
      switch (activeTab) {
        case 'overview': {
          if (enhancedOverview.Component) {
            const Comp = enhancedOverview.Component;
            return (
              <SafeRender fallback={<SafeOverviewFallback timeSaved={timeSaved} productivity={productivity} timeAudit={timeAudit} />}>
                <Comp entity={entity} period={period} timeSaved={timeSaved} productivity={productivity} timeAudit={timeAudit} />
              </SafeRender>
            );
          }
          return <SafeOverviewFallback timeSaved={timeSaved} productivity={productivity} timeAudit={timeAudit} />;
        }

        case 'goals': {
          if (enhancedGoals.Component) {
            const Comp = enhancedGoals.Component;
            return (
              <SafeRender fallback={<GoalList goals={goalsData} />}>
                <Comp entity={entity} period={period} goals={goalsData} />
              </SafeRender>
            );
          }
          return <GoalList goals={goalsData} />;
        }

        case 'habits': {
          if (enhancedHabits.Component) {
            const Comp = enhancedHabits.Component;
            return (
              <SafeRender fallback={<SafeHabitsFallback habits={habitsData} />}>
                <Comp entity={entity} period={period} habits={habitsData} />
              </SafeRender>
            );
          }
          return <SafeHabitsFallback habits={habitsData} />;
        }

        case 'ai_costs': {
          if (enhancedAICosts.Component) {
            const Comp = enhancedAICosts.Component;
            return (
              <SafeRender fallback={<LLMCostChart dashboard={costsData} />}>
                <Comp entity={entity} period={period} dashboard={costsData} />
              </SafeRender>
            );
          }
          return <LLMCostChart dashboard={costsData} />;
        }

        case 'calls': {
          if (enhancedCalls.Component) {
            const Comp = enhancedCalls.Component;
            return (
              <SafeRender fallback={<CallAnalyticsPanel analytics={callsData} />}>
                <Comp entity={entity} period={period} analytics={callsData} />
              </SafeRender>
            );
          }
          return <CallAnalyticsPanel analytics={callsData} />;
        }

        case 'time_saved': {
          if (enhancedTimeSaved.Component) {
            const Comp = enhancedTimeSaved.Component;
            return (
              <SafeRender fallback={<TimeSavedDisplay aggregate={timeSavedData} />}>
                <Comp entity={entity} period={period} aggregate={timeSavedData} />
              </SafeRender>
            );
          }
          return <TimeSavedDisplay aggregate={timeSavedData} />;
        }

        default:
          return <EmptyCard message="Select a tab to view analytics." />;
      }
    } catch {
      return <EmptyCard message="Something went wrong loading this tab. Please try again." />;
    }
  }

  // -- Render -----------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Track performance, costs, and productivity insights</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Entity Filter */}
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>{ent.label}</option>
            ))}
          </select>

          {/* Period Filter */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Analytics tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {renderTab()}
      </div>
    </div>
  );
}
