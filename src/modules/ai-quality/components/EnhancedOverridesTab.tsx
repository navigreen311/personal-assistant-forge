'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Trend = 'IMPROVING' | 'STABLE' | 'WORSENING';
type TimeRange = 'this_week' | 'this_month' | 'all_time';
type ModuleFilter =
  | 'all'
  | 'inbox'
  | 'draft'
  | 'task'
  | 'voiceforge'
  | 'capture';

type OverrideReason =
  | 'INCORRECT'
  | 'INCOMPLETE'
  | 'WRONG_TONE'
  | 'POLICY_VIOLATION'
  | 'PREFERENCE'
  | 'OTHER';

interface OverrideLogEntry {
  id: string;
  date: string;
  module: string;
  aiOutput: string;
  userCorrection: string;
  reason: OverrideReason;
  impact: string;
  fullDetail?: string;
}

interface AutoLearning {
  overridesThisWeek: number;
  accuracyImprovement: number;
}

interface OverridesApiResponse {
  totalOverrides?: number;
  overrideRate?: number;
  trend?: Trend;
  byReason?: Record<string, number>;
  topPatterns?: { pattern: string; count: number; suggestedFix: string }[];
  overrideLog?: OverrideLogEntry[];
  autoLearning?: AutoLearning;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'all_time', label: 'All Time' },
];

const MODULE_OPTIONS: { value: ModuleFilter; label: string }[] = [
  { value: 'all', label: 'All Modules' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'draft', label: 'Draft' },
  { value: 'task', label: 'Task' },
  { value: 'voiceforge', label: 'VoiceForge' },
  { value: 'capture', label: 'Capture' },
];

const REASON_COLORS: Record<string, string> = {
  INCORRECT: '#ef4444',
  WRONG_TONE: '#f59e0b',
  PREFERENCE: '#3b82f6',
  INCOMPLETE: '#8b5cf6',
  POLICY_VIOLATION: '#f97316',
  OTHER: '#9ca3af',
};

const MODULE_BADGE_COLORS: Record<string, string> = {
  inbox: 'bg-blue-100 text-blue-700',
  draft: 'bg-purple-100 text-purple-700',
  task: 'bg-amber-100 text-amber-700',
  voiceforge: 'bg-green-100 text-green-700',
  capture: 'bg-rose-100 text-rose-700',
};

const trendColors: Record<Trend, string> = {
  IMPROVING: 'text-green-600',
  STABLE: 'text-gray-600',
  WORSENING: 'text-red-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedOverridesTab({ entityId, period }: Props) {
  const [data, setData] = useState<OverridesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('this_week');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);
      params.set('timeRange', timeRange);
      if (moduleFilter !== 'all') params.set('module', moduleFilter);

      const res = await fetch(`/api/analytics/overrides?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch overrides (${res.status})`);

      const json = await res.json();
      setData(json?.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [entityId, period, timeRange, moduleFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 rounded-md bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.totalOverrides === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <svg
          className="mx-auto mb-4 h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm font-medium text-gray-500">No overrides found</p>
        <p className="mt-1 text-xs text-gray-400">
          Overrides will appear here once AI outputs are corrected by users.
        </p>
      </div>
    );
  }

  const reasonData = Object.entries(data?.byReason ?? {}).map(
    ([reason, count]) => ({
      reason: reason.replace(/_/g, ' '),
      count,
      fill: REASON_COLORS[reason] ?? REASON_COLORS.OTHER,
    })
  );

  const overrideLog = data?.overrideLog ?? [];
  const filteredLog =
    moduleFilter === 'all'
      ? overrideLog
      : overrideLog.filter(
          (entry) => entry?.module?.toLowerCase() === moduleFilter
        );

  const autoLearning = data?.autoLearning;

  // ---------- Main render ----------
  return (
    <div className="space-y-6">
      {/* ---- Filter Row ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">
            Time Range
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Module</label>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value as ModuleFilter)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {MODULE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---- Summary Stats ---- */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Override Analysis
        </h3>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {data?.totalOverrides ?? 0}
            </p>
            <p className="text-xs text-gray-400">Total Overrides</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {((data?.overrideRate ?? 0) * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400">Override Rate</p>
          </div>
          <div className="text-center">
            <p
              className={`text-2xl font-bold ${
                trendColors[data?.trend ?? 'STABLE']
              }`}
            >
              {data?.trend ?? 'STABLE'}
            </p>
            <p className="text-xs text-gray-400">Trend</p>
          </div>
        </div>

        {/* ---- By-Reason Horizontal Bar Chart ---- */}
        {reasonData.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium uppercase text-gray-400">
              By Reason
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={reasonData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="reason" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="count">
                  {reasonData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Reason legend */}
            <div className="mt-2 flex flex-wrap gap-3">
              {Object.entries(REASON_COLORS).map(([reason, color]) => (
                <div key={reason} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-gray-500">
                    {reason.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---- Top Patterns Table ---- */}
      {(data?.topPatterns?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="mb-3 text-xs font-medium uppercase text-gray-400">
            Top Patterns
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-gray-500">Pattern</th>
                <th className="pb-2 text-right text-gray-500">Count</th>
                <th className="pb-2 text-left text-gray-500 pl-4">
                  Suggested Fix
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.topPatterns?.map((p, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 font-medium text-gray-700">
                    {p?.pattern}
                  </td>
                  <td className="py-1.5 text-right">{p?.count}</td>
                  <td className="py-1.5 pl-4 text-gray-500">
                    {p?.suggestedFix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Override Log Table ---- */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Override Log
        </h3>

        {filteredLog.length === 0 ? (
          <p className="text-sm text-gray-400">
            No override log entries for the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-gray-500">Date</th>
                  <th className="pb-2 text-left text-gray-500">Module</th>
                  <th className="pb-2 text-left text-gray-500">AI Output</th>
                  <th className="pb-2 text-left text-gray-500">
                    User Correction
                  </th>
                  <th className="pb-2 text-left text-gray-500">Reason</th>
                  <th className="pb-2 text-left text-gray-500">Impact</th>
                  <th className="pb-2 text-right text-gray-500" />
                </tr>
              </thead>
              <tbody>
                {filteredLog.map((entry) => (
                  <OverrideLogRow
                    key={entry?.id}
                    entry={entry}
                    expanded={expandedRow === entry?.id}
                    onToggle={() =>
                      setExpandedRow(
                        expandedRow === entry?.id ? null : entry?.id ?? null
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Auto-Learning Indicator Card ---- */}
      {autoLearning && (autoLearning?.overridesThisWeek ?? 0) > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            {/* Sparkle icon */}
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-800">
                Auto-Learning Active
              </p>
              <p className="mt-1 text-sm text-green-700">
                {autoLearning?.overridesThisWeek ?? 0} override
                {(autoLearning?.overridesThisWeek ?? 0) !== 1 ? 's' : ''} this
                week {(autoLearning?.overridesThisWeek ?? 0) !== 1 ? 'have' : 'has'}{' '}
                been fed back into the system.
                {(autoLearning?.accuracyImprovement ?? 0) > 0 && (
                  <>
                    {' '}
                    Triage accuracy improved{' '}
                    {autoLearning?.accuracyImprovement ?? 0}% since last week as
                    a result.
                  </>
                )}
                {(autoLearning?.accuracyImprovement ?? 0) === 0 &&
                  ' Accuracy metrics are being recalculated.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverrideLogRow - extracted to avoid React fragment key issues in tbody
// ---------------------------------------------------------------------------

interface OverrideLogRowProps {
  entry: OverrideLogEntry;
  expanded: boolean;
  onToggle: () => void;
}

function OverrideLogRow({ entry, expanded, onToggle }: OverrideLogRowProps) {
  return (
    <>
      <tr
        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2 text-gray-600 whitespace-nowrap">
          {entry?.date
            ? new Date(entry.date).toLocaleDateString()
            : '--'}
        </td>
        <td className="py-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              MODULE_BADGE_COLORS[entry?.module?.toLowerCase() ?? ''] ??
              'bg-gray-100 text-gray-600'
            }`}
          >
            {entry?.module ?? 'Unknown'}
          </span>
        </td>
        <td className="py-2 text-gray-700 max-w-[200px] truncate">
          {entry?.aiOutput ?? '--'}
        </td>
        <td className="py-2 text-gray-700 max-w-[200px] truncate">
          {entry?.userCorrection ?? '--'}
        </td>
        <td className="py-2">
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${
                REASON_COLORS[entry?.reason ?? 'OTHER'] ?? REASON_COLORS.OTHER
              }20`,
              color:
                REASON_COLORS[entry?.reason ?? 'OTHER'] ?? REASON_COLORS.OTHER,
            }}
          >
            {entry?.reason?.replace(/_/g, ' ') ?? 'Unknown'}
          </span>
        </td>
        <td className="py-2 text-gray-500 max-w-[180px] truncate">
          {entry?.impact ?? '--'}
        </td>
        <td className="py-2 text-right">
          <svg
            className={`inline-block h-4 w-4 text-gray-400 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="border-b border-gray-100">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                  AI Output (Full)
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {entry?.aiOutput ?? '--'}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                  User Correction (Full)
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {entry?.userCorrection ?? '--'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                  Impact &amp; Learning
                </p>
                <p className="text-sm text-gray-700">
                  {entry?.impact ?? 'No impact data available.'}
                </p>
                {entry?.fullDetail && (
                  <p className="mt-2 text-sm text-gray-500">
                    {entry.fullDetail}
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
