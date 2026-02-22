'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AccuracyScorecard } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModuleBreakdownRow {
  module: string;
  accuracy: number;
  trend: 'up' | 'down' | 'flat';
  volume: number;
  topIssue: string;
}

interface ConfidenceBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

interface ScorecardAlert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
}

interface ScorecardApiData {
  scorecard: AccuracyScorecard;
  history: AccuracyScorecard[];
}

interface AccuracyApiData {
  moduleBreakdown: ModuleBreakdownRow[];
  confidenceDistribution: ConfidenceBucket[];
  alerts: ScorecardAlert[];
}

interface EnhancedScorecardTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const gradeColors: Record<string, string> = {
  A: 'text-green-600 bg-green-50 border-green-200',
  B: 'text-blue-600 bg-blue-50 border-blue-200',
  C: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  D: 'text-orange-600 bg-orange-50 border-orange-200',
  F: 'text-red-600 bg-red-50 border-red-200',
};

const gradeToNum: Record<string, number> = {
  A: 95,
  B: 85,
  C: 75,
  D: 65,
  F: 50,
};

const DEFAULT_MODULE_BREAKDOWN: ModuleBreakdownRow[] = [
  { module: 'Inbox Triage', accuracy: 0, trend: 'flat', volume: 0, topIssue: '—' },
  { module: 'Draft Composer', accuracy: 0, trend: 'flat', volume: 0, topIssue: '—' },
  { module: 'Task Creation', accuracy: 0, trend: 'flat', volume: 0, topIssue: '—' },
  { module: 'VoiceForge', accuracy: 0, trend: 'flat', volume: 0, topIssue: '—' },
  { module: 'Capture Routing', accuracy: 0, trend: 'flat', volume: 0, topIssue: '—' },
];

const DEFAULT_CONFIDENCE_BUCKETS: ConfidenceBucket[] = [
  { label: '0-50', min: 0, max: 50, count: 0 },
  { label: '50-60', min: 50, max: 60, count: 0 },
  { label: '60-70', min: 60, max: 70, count: 0 },
  { label: '70-80', min: 70, max: 80, count: 0 },
  { label: '80-90', min: 80, max: 90, count: 0 },
  { label: '90-100', min: 90, max: 100, count: 0 },
];

const THRESHOLD_OPTIONS = [50, 60, 70, 80, 90];
// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 h-3 w-20 rounded bg-gray-200" />
      <div className="h-7 w-24 rounded bg-gray-200" />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 flex-1 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-48 rounded bg-gray-200" />
      <div className="flex h-48 items-end gap-3 px-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gray-100"
            style={{ height: `${30 + i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function SkeletonAlerts() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-24 rounded bg-gray-200" />
      <div className="space-y-2">
        <div className="h-12 rounded bg-gray-100" />
        <div className="h-12 rounded bg-gray-100" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function barColor(value: number): string {
  if (value >= 80) return '#22c55e';
  if (value >= 60) return '#eab308';
  return '#ef4444';
}

function bucketColor(min: number): string {
  if (min >= 80) return '#22c55e';
  if (min >= 60) return '#eab308';
  return '#ef4444';
}

function trendArrow(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '\u2191';
  if (trend === 'down') return '\u2193';
  return '\u2192';
}

function trendColor(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return 'text-green-600';
  if (trend === 'down') return 'text-red-600';
  return 'text-gray-500';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EnhancedScorecardTab({
  entityId,
  period,
}: EnhancedScorecardTabProps) {
  const [scorecardData, setScorecardData] = useState<ScorecardApiData | null>(null);
  const [accuracyData, setAccuracyData] = useState<AccuracyApiData | null>(null);
  const [loadingScorecard, setLoadingScorecard] = useState(true);
  const [loadingAccuracy, setLoadingAccuracy] = useState(true);
  const [errorScorecard, setErrorScorecard] = useState<string | null>(null);
  const [errorAccuracy, setErrorAccuracy] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(70);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // --- Fetch scorecard data ---

  const fetchScorecard = useCallback(async () => {
    setLoadingScorecard(true);
    setErrorScorecard(null);

    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch(`/api/analytics/scorecard?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load scorecard (${res.status})`);

      const json: ScorecardApiData = await res.json();
      setScorecardData(json);
    } catch (err) {
      setErrorScorecard(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingScorecard(false);
    }
  }, [entityId, period]);

  // --- Fetch accuracy / module data ---

  const fetchAccuracy = useCallback(async () => {
    setLoadingAccuracy(true);
    setErrorAccuracy(null);

    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch(`/api/analytics/ai-accuracy?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load accuracy data (${res.status})`);

      const json: AccuracyApiData = await res.json();
      setAccuracyData(json);
    } catch (err) {
      setErrorAccuracy(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingAccuracy(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchScorecard();
    fetchAccuracy();
  }, [fetchScorecard, fetchAccuracy]);

  // --- Derived values (safe defaults via optional chaining) ---

  const scorecard = scorecardData?.scorecard;
  const history = scorecardData?.history ?? [];
  const overallGrade = scorecard?.overallGrade ?? 'F';

  const dimensions = [
    { label: 'Triage Accuracy', value: scorecard?.triageAccuracy ?? 0 },
    { label: 'Draft Approval', value: scorecard?.draftApprovalRate ?? 0 },
    { label: 'Deadline Performance', value: 100 - (scorecard?.missedDeadlineRate ?? 0) },
    { label: 'Automation Success', value: scorecard?.automationSuccessRate ?? 0 },
  ];

  const moduleBreakdown = accuracyData?.moduleBreakdown ?? DEFAULT_MODULE_BREAKDOWN;
  const confidenceBuckets = accuracyData?.confidenceDistribution ?? DEFAULT_CONFIDENCE_BUCKETS;
  const alerts = accuracyData?.alerts ?? [];

  const maxBucketCount = Math.max(1, ...confidenceBuckets.map((b) => b?.count ?? 0));

  const trendData = history.map((s) => ({
    period: s?.period ?? '',
    grade: gradeToNum[s?.overallGrade ?? 'F'] ?? 50,
    triage: s?.triageAccuracy ?? 0,
    drafts: s?.draftApprovalRate ?? 0,
    automation: s?.automationSuccessRate ?? 0,
  }));

  // --- Error fallback helper ---

  function renderError(message: string, retry: () => void) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-800">Failed to load data</p>
        <p className="mt-1 text-xs text-red-600">{message}</p>
        <button
          onClick={retry}
          className="mt-3 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* SECTION 1: Existing Scorecard Display                             */}
      {/* ================================================================= */}

      {errorScorecard ? (
        renderError(errorScorecard, fetchScorecard)
      ) : loadingScorecard ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonChart />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Grade Badge + 4 Metric Bars */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  AI Quality Scorecard
                </h3>
                <p className="text-sm text-gray-500">
                  {scorecard?.period ?? 'Current Period'}
                </p>
              </div>
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-xl border-2 text-3xl font-bold ${gradeColors[overallGrade] ?? gradeColors.F}`}
              >
                {overallGrade}
              </div>
            </div>

            <div className="space-y-3">
              {dimensions.map((dim) => (
                <div key={dim.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{dim.label}</span>
                    <span className="font-medium">{dim.value}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${dim.value}%`,
                        backgroundColor: barColor(dim.value),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scorecard History Trend */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Scorecard History
            </h3>
            {trendData.length === 0 ? (
              <p className="text-sm text-gray-400">No history data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="grade"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Overall Grade"
                  />
                  <Line
                    type="monotone"
                    dataKey="triage"
                    stroke="#22c55e"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    name="Triage"
                  />
                  <Line
                    type="monotone"
                    dataKey="automation"
                    stroke="#a855f7"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    name="Automation"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 2: Module-Level Breakdown (NEW)                           */}
      {/* ================================================================= */}

      {errorAccuracy ? (
        renderError(errorAccuracy, fetchAccuracy)
      ) : loadingAccuracy ? (
        <SkeletonTable rows={5} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Module-Level Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Module</th>
                  <th className="pb-3 pr-4">Accuracy</th>
                  <th className="pb-3 pr-4 text-center">Trend</th>
                  <th className="pb-3 pr-4 text-right">Volume</th>
                  <th className="pb-3">Top Issue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {moduleBreakdown.map((row) => {
                  const acc = row?.accuracy ?? 0;
                  const modName = row?.module ?? 'Unknown';
                  const isExpanded = expandedModule === modName;
                  return (
                    <tr
                      key={modName}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() =>
                        setExpandedModule(isExpanded ? null : modName)
                      }
                    >
                      <td className="py-2.5 pr-4 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8.25 4.5l7.5 7.5-7.5 7.5"
                            />
                          </svg>
                          {modName}
                        </div>
                        {isExpanded && (
                          <div className="mt-2 ml-6 rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500">
                            Detailed breakdown for {modName} coming soon.
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${acc}%`,
                                backgroundColor: barColor(acc),
                              }}
                            />
                          </div>
                          <span
                            className="min-w-[40px] text-right font-medium"
                            style={{ color: barColor(acc) }}
                          >
                            {acc}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        <span
                          className={`text-lg font-bold ${trendColor(row?.trend ?? 'flat')}`}
                          title={row?.trend ?? 'flat'}
                        >
                          {trendArrow(row?.trend ?? 'flat')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {(row?.volume ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-gray-600">
                        {row?.topIssue ?? '\u2014'}
                      </td>
                    </tr>
                  );
                })}
                {moduleBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      No module data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 3: Confidence Score Distribution Histogram (NEW)          */}
      {/* ================================================================= */}

      {errorAccuracy ? null : loadingAccuracy ? (
        <SkeletonChart />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Confidence Score Distribution
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Actions below the threshold require human approval
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="confidence-threshold"
                className="text-xs font-medium text-gray-600"
              >
                Threshold
              </label>
              <select
                id="confidence-threshold"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {THRESHOLD_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}%
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Histogram */}
          <div className="relative flex h-56 items-end gap-2 px-2 pt-6 pb-8">
            {/* Threshold line */}
            {(() => {
              const bucketWidth = 100 / confidenceBuckets.length;
              let thresholdPct = 0;
              for (let i = 0; i < confidenceBuckets.length; i++) {
                const b = confidenceBuckets[i];
                const bMin = b?.min ?? 0;
                const bMax = b?.max ?? 100;
                if (threshold <= bMin) {
                  thresholdPct = i * bucketWidth;
                  break;
                }
                if (threshold >= bMin && threshold <= bMax) {
                  const fraction = (threshold - bMin) / (bMax - bMin);
                  thresholdPct = (i + fraction) * bucketWidth;
                  break;
                }
                if (i === confidenceBuckets.length - 1) {
                  thresholdPct = 100;
                }
              }
              return (
                <div
                  className="absolute top-0 bottom-8 z-10 border-l-2 border-dashed border-blue-600"
                  style={{ left: `calc(${thresholdPct}% + 8px)` }}
                >
                  <span className="absolute -top-1 -translate-x-1/2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap">
                    {threshold}% threshold
                  </span>
                </div>
              );
            })()}

            {/* Bars */}
            {confidenceBuckets.map((bucket) => {
              const count = bucket?.count ?? 0;
              const heightPct =
                maxBucketCount > 0 ? (count / maxBucketCount) * 100 : 0;
              const min = bucket?.min ?? 0;
              const color = bucketColor(min);

              return (
                <div
                  key={bucket?.label ?? String(min)}
                  className="group relative flex flex-1 flex-col items-center"
                >
                  {/* Bar container */}
                  <div
                    className="relative flex w-full items-end"
                    style={{ height: '180px' }}
                  >
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.max(heightPct, 2)}%`,
                        backgroundColor: color,
                        opacity: 0.85,
                      }}
                    />
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {count} action{count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {/* Bucket label */}
                  <span className="mt-1 text-[10px] text-gray-500">
                    {bucket?.label ?? ''}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Color legend */}
          <div className="mt-2 flex items-center justify-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded"
                style={{ backgroundColor: '#ef4444' }}
              />
              {'< 60% (Red)'}
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded"
                style={{ backgroundColor: '#eab308' }}
              />
              60-80% (Yellow)
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded"
                style={{ backgroundColor: '#22c55e' }}
              />
              {'> 80% (Green)'}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 4: Alerts (NEW)                                           */}
      {/* ================================================================= */}

      {errorAccuracy ? null : loadingAccuracy ? (
        <SkeletonAlerts />
      ) : alerts.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
            <button
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              onClick={() => {
                /* placeholder: open alert threshold configuration */
              }}
            >
              Configure alert thresholds
            </button>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => {
              const isCritical =
                (alert?.severity ?? 'warning') === 'critical';
              return (
                <div
                  key={alert?.id ?? alert?.message ?? String(Math.random())}
                  className={`flex items-start gap-3 rounded-lg border p-4 ${
                    isCritical
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  {/* Warning triangle icon */}
                  <svg
                    className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                      isCritical ? 'text-red-500' : 'text-amber-500'
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        isCritical ? 'text-red-800' : 'text-amber-800'
                      }`}
                    >
                      {alert?.message ?? 'Unknown alert'}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        isCritical ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      Severity: {isCritical ? 'Critical' : 'Warning'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-sm font-medium text-green-800">
            All metrics within acceptable thresholds
          </p>
          <button
            className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            onClick={() => {
              /* placeholder: open alert threshold configuration */
            }}
          >
            Configure alert thresholds
          </button>
        </div>
      )}
    </div>
  );
}
