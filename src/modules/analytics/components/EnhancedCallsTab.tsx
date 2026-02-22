'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CallAnalytics } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedCallsTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface EntityBreakdown {
  entity: string;
  calls: number;
  connectPercent: number;
  avgDuration: number;
  roi: number;
}

interface WeeklyTrend {
  weekLabel: string;
  calls: number;
  connectRate: number;
}

interface ScriptPerformance {
  scriptName: string;
  uses: number;
  connectRate: number;
  avgDuration: number;
  conversion: number;
}

interface SentimentDist {
  positive: number;
  neutral: number;
  negative: number;
}

interface EnhancedCallData {
  analytics: CallAnalytics;
  entityBreakdown?: EntityBreakdown[];
  weeklyTrends?: WeeklyTrend[];
  topScripts?: ScriptPerformance[];
  sentimentDistribution?: SentimentDist;
  campaigns?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectRateBg(percent: number): string {
  if (percent >= 70) return 'bg-green-100 text-green-800';
  if (percent >= 50) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return Math.round(seconds) + 's';
  return Math.round(seconds / 60) + 'm';
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Stats row skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
            <div className="h-8 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Outcomes skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
        <div className="h-8 w-full rounded bg-gray-200" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 h-5 w-48 rounded bg-gray-200" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-2 h-10 w-full rounded bg-gray-100" />
        ))}
      </div>

      {/* Trend skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 h-5 w-32 rounded bg-gray-200" />
        <div className="flex items-end gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded bg-gray-200"
              style={{ height: (40 + i * 20) + 'px' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
      <div className="mb-4 text-4xl text-gray-300">☎</div>
      <h3 className="mb-1 text-lg font-semibold text-gray-700">No Call Data</h3>
      <p className="text-sm text-gray-500">
        No call analytics available for the selected filters. Try adjusting the
        period or entity.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome Colors
// ---------------------------------------------------------------------------

const OUTCOME_COLORS: Record<string, string> = {
  CONNECTED: '#22c55e',
  VOICEMAIL: '#f59e0b',
  NO_ANSWER: '#ef4444',
  BUSY: '#3b82f6',
  FAILED: '#6b7280',
  UNKNOWN: '#a855f7',
};

function getOutcomeColor(outcome: string): string {
  return OUTCOME_COLORS[outcome] ?? '#94a3b8';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedCallsTab({ entityId, period }: EnhancedCallsTabProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EnhancedCallData | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');

  // ---------- Fetch ----------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch('/api/analytics/call-analytics?' + params.toString());
      if (!res.ok) throw new Error('Failed to fetch call analytics: ' + res.statusText);

      const json = await res.json();
      const payload: EnhancedCallData = json?.data ?? json;
      setData(payload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------- Derived ----------

  const analytics = data?.analytics;
  const campaigns = data?.campaigns ?? [];

  const outcomeEntries = useMemo(() => {
    if (!analytics?.outcomeDistribution) return [];
    return Object.entries(analytics.outcomeDistribution);
  }, [analytics?.outcomeDistribution]);

  const totalOutcomes = useMemo(
    () => outcomeEntries.reduce((sum, [, v]) => sum + v, 0),
    [outcomeEntries],
  );

  const entityBreakdown = useMemo(() => {
    const rows = data?.entityBreakdown ?? [];
    if (selectedCampaign === 'all') return rows;
    return rows.filter((r) => r.entity === selectedCampaign);
  }, [data?.entityBreakdown, selectedCampaign]);

  const weeklyTrends = data?.weeklyTrends ?? [];
  const maxWeeklyCalls = useMemo(
    () => Math.max(...weeklyTrends.map((w) => w.calls), 1),
    [weeklyTrends],
  );

  const topScripts = useMemo(() => {
    const scripts = data?.topScripts ?? [];
    return [...scripts].sort((a, b) => b.connectRate - a.connectRate);
  }, [data?.topScripts]);

  const sentiment = data?.sentimentDistribution;

  // ---------- Render ----------

  if (loading) return <LoadingSkeleton />;
  if (!analytics || analytics.totalCalls === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      {/* ---- Filter Row ---- */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Campaign</label>
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Campaigns</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {period && (
          <span className="ml-auto rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            Period: {period}
          </span>
        )}
      </div>

      {/* ---- Stats Row (4 cards) ---- */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {analytics?.totalCalls ?? 0}
          </p>
          <p className="text-xs text-gray-400">Total Calls</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {analytics?.connectRate ?? 0}%
          </p>
          <p className="text-xs text-gray-400">Connect Rate</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {formatDuration(analytics?.averageDuration ?? 0)}
          </p>
          <p className="text-xs text-gray-400">Avg Duration</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">
            {(analytics?.sentimentAverage ?? 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">Sentiment Score</p>
        </div>
      </div>

      {/* ---- Outcomes Visualization ---- */}
      {outcomeEntries.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Outcome Distribution
          </h3>

          {/* Stacked bar */}
          <div className="mb-3 flex h-8 w-full overflow-hidden rounded-full">
            {outcomeEntries.map(([outcome, count]) => {
              const pct = totalOutcomes > 0 ? (count / totalOutcomes) * 100 : 0;
              return (
                <div
                  key={outcome}
                  title={outcome + ': ' + count + ' (' + Math.round(pct) + '%)'}
                  className="transition-all"
                  style={{
                    width: pct + '%',
                    backgroundColor: getOutcomeColor(outcome),
                    minWidth: pct > 0 ? '4px' : '0',
                  }}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            {outcomeEntries.map(([outcome, count]) => (
              <div key={outcome} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: getOutcomeColor(outcome) }}
                />
                <span>
                  {outcome}: {count} ({totalOutcomes > 0 ? Math.round((count / totalOutcomes) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- ROI by Call Type ---- */}
      {(analytics?.roiPerCallType?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            ROI by Call Type
          </h3>
          <div className="space-y-3">
            {analytics?.roiPerCallType?.map((r) => (
              <div
                key={r.callType}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium text-gray-700">{r.callType}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">
                    Rev ${r.averageRevenue?.toFixed(2) ?? '0.00'} / Cost ${r.averageCost?.toFixed(2) ?? '0.00'}
                  </span>
                  <span
                    className={'font-semibold ' + ((r.roi ?? 0) > 0 ? 'text-green-600' : 'text-red-600')}
                  >
                    {r.roi ?? 0}% ROI
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Per-Entity Breakdown Table ---- */}
      {entityBreakdown.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Per-Entity Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="pb-2 pr-4 font-medium">Entity</th>
                  <th className="pb-2 pr-4 font-medium">Calls</th>
                  <th className="pb-2 pr-4 font-medium">Connect %</th>
                  <th className="pb-2 pr-4 font-medium">Avg Duration</th>
                  <th className="pb-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {entityBreakdown.map((row) => (
                  <tr key={row.entity} className="border-b border-gray-100">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">
                      {row.entity}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{row.calls}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={'inline-block rounded px-2 py-0.5 text-xs font-semibold ' + connectRateBg(row.connectPercent)}
                      >
                        {row.connectPercent}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">
                      {formatDuration(row.avgDuration)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={'font-semibold ' + (row.roi > 0 ? 'text-green-600' : 'text-red-600')}
                      >
                        {row.roi}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Weekly Trend ---- */}
      {weeklyTrends.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Weekly Trend (Last 4 Weeks)
          </h3>
          <div className="relative flex items-end gap-3" style={{ height: '180px' }}>
            {weeklyTrends.map((week) => {
              const barHeight =
                maxWeeklyCalls > 0
                  ? Math.max((week.calls / maxWeeklyCalls) * 160, 4)
                  : 4;
              const connectY = 160 - (week.connectRate / 100) * 160;
              return (
                <div
                  key={week.weekLabel}
                  className="relative flex flex-1 flex-col items-center"
                  style={{ height: '180px' }}
                >
                  {/* Connect rate label */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold text-blue-600"
                    style={{ top: Math.max(connectY - 4, 0) + 'px' }}
                  >
                    {week.connectRate}%
                  </div>
                  {/* Bar */}
                  <div className="mt-auto flex w-full flex-col items-center">
                    <div
                      className="w-full max-w-[48px] rounded-t bg-blue-500 transition-all"
                      style={{ height: barHeight + 'px' }}
                      title={week.calls + ' calls'}
                    />
                    <span className="mt-1 text-xs text-gray-500">
                      {week.weekLabel}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Connect rate line overlay */}
            <svg
              className="pointer-events-none absolute inset-0"
              style={{ height: '160px', top: '0', left: '0', width: '100%' }}
              viewBox={'0 0 ' + (weeklyTrends.length * 100) + ' 160'}
              preserveAspectRatio="none"
            >
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                strokeDasharray="6,3"
                points={weeklyTrends
                  .map((w, i) => {
                    const x = i * 100 + 50;
                    const y = 160 - (w.connectRate / 100) * 160;
                    return x + ',' + y;
                  })
                  .join(' ')}
              />
              {weeklyTrends.map((w, i) => {
                const cx = i * 100 + 50;
                const cy = 160 - (w.connectRate / 100) * 160;
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="#2563eb"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* ---- Top Performing Scripts ---- */}
      {topScripts.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Top Performing Scripts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="pb-2 pr-4 font-medium">Script Name</th>
                  <th className="pb-2 pr-4 font-medium">Uses</th>
                  <th className="pb-2 pr-4 font-medium">Connect Rate</th>
                  <th className="pb-2 pr-4 font-medium">Avg Duration</th>
                  <th className="pb-2 font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {topScripts.map((script) => (
                  <tr
                    key={script.scriptName}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2.5 pr-4 font-medium text-gray-800">
                      {script.scriptName}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">
                      {script.uses}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={'inline-block rounded px-2 py-0.5 text-xs font-semibold ' + connectRateBg(script.connectRate)}
                      >
                        {script.connectRate}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">
                      {formatDuration(script.avgDuration)}
                    </td>
                    <td className="py-2.5">
                      <span className="font-semibold text-gray-800">
                        {script.conversion}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Sentiment Distribution ---- */}
      {sentiment && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Sentiment Distribution
          </h3>

          {/* Horizontal stacked bar */}
          <div className="mb-3 flex h-8 w-full overflow-hidden rounded-full">
            {(sentiment?.positive ?? 0) > 0 && (
              <div
                className="flex items-center justify-center text-xs font-semibold text-white transition-all"
                style={{
                  width: (sentiment?.positive ?? 0) + '%',
                  backgroundColor: '#16a34a',
                  minWidth: '20px',
                }}
                title={'Positive: ' + (sentiment?.positive ?? 0) + '%'}
              >
                {(sentiment?.positive ?? 0) >= 10 ? (sentiment?.positive ?? 0) + '%' : ''}
              </div>
            )}
            {(sentiment?.neutral ?? 0) > 0 && (
              <div
                className="flex items-center justify-center text-xs font-semibold text-white transition-all"
                style={{
                  width: (sentiment?.neutral ?? 0) + '%',
                  backgroundColor: '#6b7280',
                  minWidth: '20px',
                }}
                title={'Neutral: ' + (sentiment?.neutral ?? 0) + '%'}
              >
                {(sentiment?.neutral ?? 0) >= 10 ? (sentiment?.neutral ?? 0) + '%' : ''}
              </div>
            )}
            {(sentiment?.negative ?? 0) > 0 && (
              <div
                className="flex items-center justify-center text-xs font-semibold text-white transition-all"
                style={{
                  width: (sentiment?.negative ?? 0) + '%',
                  backgroundColor: '#dc2626',
                  minWidth: '20px',
                }}
                title={'Negative: ' + (sentiment?.negative ?? 0) + '%'}
              >
                {(sentiment?.negative ?? 0) >= 10 ? (sentiment?.negative ?? 0) + '%' : ''}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex gap-6 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-green-600" />
              Positive: {sentiment?.positive ?? 0}%
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-gray-500" />
              Neutral: {sentiment?.neutral ?? 0}%
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
              Negative: {sentiment?.negative ?? 0}%
            </div>
          </div>
        </div>
      )}

      {/* ---- AI Insights ---- */}
      {(analytics?.insights?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-800">
            AI Insights
          </h3>
          <ul className="list-disc space-y-1 pl-4 text-sm text-blue-700">
            {analytics?.insights?.map((insight, i) => (
              <li key={i}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
