'use client';

import { useEffect, useState, useCallback } from 'react';

interface ProductivityData {
  productivityScore?: number;
  focusTimeAchieved?: number;
  focusTimeTarget?: number;
  tasksCompleted?: number;
  tasksTotal?: number;
  timeSavedByAI?: number;
  trend?: 'IMPROVING' | 'STABLE' | 'DECLINING';
  weeklyTrends?: WeeklyTrend[];
}

interface WeeklyTrend {
  week?: string;
  tasksCompleted?: number;
}

interface TimeAuditData {
  allocation?: TimeAllocationEntry[];
  comparison?: TimeComparisonEntry[];
}

interface TimeAllocationEntry {
  category?: string;
  percentage?: number;
  color?: string;
}

interface TimeComparisonEntry {
  category?: string;
  intended?: number;
  actual?: number;
}

interface AIAccuracyData {
  triageAccuracy?: number;
  draftApprovalRate?: number;
  predictionQuality?: number;
  classificationAccuracy?: number;
}

interface EnhancedOverviewTabProps {
  entityId?: string;
  period?: string;
}

interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}
function buildUrl(path: string, entityId?: string, period?: string): string {
  const params = new URLSearchParams();
  if (entityId) params.set('entityId', entityId);
  if (period) params.set('period', period);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function getAccuracyColor(value: number): string {
  if (value >= 90) return 'text-green-600';
  if (value >= 75) return 'text-amber-500';
  return 'text-red-500';
}

function getAccuracyRing(value: number): string {
  if (value >= 90) return 'ring-green-200';
  if (value >= 75) return 'ring-amber-200';
  return 'ring-red-200';
}

const DEFAULT_ALLOCATION_COLORS: Record<string, string> = {
  Meetings: '#3b82f6',
  Focus: '#8b5cf6',
  Admin: '#f59e0b',
  Comms: '#22c55e',
  Personal: '#ec4899',
};

function ScorecardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 h-3 w-24 rounded bg-gray-200" />
          <div className="mb-2 h-8 w-20 rounded bg-gray-200" />
          <div className="h-3 w-16 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function TimeAuditSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 h-4 w-32 rounded bg-gray-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-3 flex items-center gap-3">
            <div className="h-3 w-16 rounded bg-gray-200" />
            <div className="h-4 flex-1 rounded bg-gray-100" />
            <div className="h-3 w-10 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 h-4 w-40 rounded bg-gray-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-3">
            <div className="mb-1 h-3 w-20 rounded bg-gray-200" />
            <div className="flex gap-2">
              <div className="h-4 flex-1 rounded bg-gray-100" />
              <div className="h-4 flex-1 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendsSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-end justify-around gap-4" style={{ height: 180 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-14 rounded bg-gray-200" style={{ height: 40 + i * 30 }} />
            <div className="h-3 w-10 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AccuracySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 h-3 w-28 rounded bg-gray-200" />
          <div className="h-8 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
      <svg className="h-5 w-5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="flex-1 text-sm text-red-700">{message}</p>
      <button onClick={onRetry} className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-200">
        Retry
      </button>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
      {title}
    </h2>
  );
}

export default function EnhancedOverviewTab({
  entityId,
  period,
}: EnhancedOverviewTabProps) {
  const [productivity, setProductivity] = useState<SectionState<ProductivityData>>({
    data: null, loading: true, error: null,
  });
  const [timeAudit, setTimeAudit] = useState<SectionState<TimeAuditData>>({
    data: null, loading: true, error: null,
  });
  const [aiAccuracy, setAiAccuracy] = useState<SectionState<AIAccuracyData>>({
    data: null, loading: true, error: null,
  });

  const fetchProductivity = useCallback(async () => {
    setProductivity((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(buildUrl('/api/analytics/productivity', entityId, period));
      if (!res.ok) throw new Error('Failed to load productivity data (' + res.status + ')');
      const json = await res.json();
      setProductivity({ data: json ?? null, loading: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load productivity data';
      setProductivity({ data: null, loading: false, error: message });
    }
  }, [entityId, period]);

  const fetchTimeAudit = useCallback(async () => {
    setTimeAudit((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(buildUrl('/api/analytics/time-audit', entityId, period));
      if (!res.ok) throw new Error('Failed to load time audit data (' + res.status + ')');
      const json = await res.json();
      setTimeAudit({ data: json ?? null, loading: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load time audit data';
      setTimeAudit({ data: null, loading: false, error: message });
    }
  }, [entityId, period]);

  const fetchAiAccuracy = useCallback(async () => {
    setAiAccuracy((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(buildUrl('/api/analytics/ai-accuracy', entityId, period));
      if (!res.ok) throw new Error('Failed to load AI accuracy data (' + res.status + ')');
      const json = await res.json();
      setAiAccuracy({ data: json ?? null, loading: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load AI accuracy data';
      setAiAccuracy({ data: null, loading: false, error: message });
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchProductivity();
    fetchTimeAudit();
    fetchAiAccuracy();
  }, [fetchProductivity, fetchTimeAudit, fetchAiAccuracy]);

  const prodData = productivity.data;
  const score = prodData?.productivityScore ?? 0;
  const focusAchieved = prodData?.focusTimeAchieved ?? 0;
  const focusTarget = prodData?.focusTimeTarget ?? 0;
  const tasksCompleted = prodData?.tasksCompleted ?? 0;
  const tasksTotal = prodData?.tasksTotal ?? 0;
  const timeSaved = prodData?.timeSavedByAI ?? 0;
  const trend = prodData?.trend ?? 'STABLE';
  const weeklyTrends = prodData?.weeklyTrends ?? [];

  const allocation = timeAudit.data?.allocation ?? [];
  const comparison = timeAudit.data?.comparison ?? [];

  const triageAcc = aiAccuracy.data?.triageAccuracy ?? 0;
  const draftRate = aiAccuracy.data?.draftApprovalRate ?? 0;
  const predQuality = aiAccuracy.data?.predictionQuality ?? 0;
  const classAcc = aiAccuracy.data?.classificationAccuracy ?? 0;

  const maxTasks = Math.max(...weeklyTrends.map((w) => w?.tasksCompleted ?? 0), 1);

  const trendDirection = (() => {
    if (weeklyTrends.length < 2) return 'stable';
    const last = weeklyTrends[weeklyTrends.length - 1]?.tasksCompleted ?? 0;
    const prev = weeklyTrends[weeklyTrends.length - 2]?.tasksCompleted ?? 0;
    if (last > prev) return 'up';
    if (last < prev) return 'down';
    return 'stable';
  })();

  return (
    <div className="space-y-8">
      {/* PRODUCTIVITY SCORECARD */}
      <section>
        <SectionHeader title="Productivity Scorecard" />
        {productivity.loading ? (
          <ScorecardSkeleton />
        ) : productivity.error ? (
          <SectionError message={productivity.error} onRetry={fetchProductivity} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-1 text-sm font-medium text-gray-500">Productivity Score</p>
              <p className="text-3xl font-bold text-blue-600">
                {score}<span className="text-base font-normal text-gray-400">/100</span>
              </p>
              <div className="mt-2 flex items-center gap-1 text-sm">
                <span className={trend === 'IMPROVING' ? 'text-green-600' : trend === 'DECLINING' ? 'text-red-500' : 'text-gray-500'}>
                  {trend === 'IMPROVING' ? '\u2191 Improving' : trend === 'DECLINING' ? '\u2193 Declining' : '\u2192 Stable'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-1 text-sm font-medium text-gray-500">Focus Time Achieved</p>
              <p className="text-3xl font-bold text-purple-600">
                {focusAchieved}h<span className="text-base font-normal text-gray-400">{' '}/ {focusTarget}h</span>
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-purple-100">
                <div className="h-2 rounded-full bg-purple-500 transition-all" style={{ width: `${Math.min(focusTarget > 0 ? (focusAchieved / focusTarget) * 100 : 0, 100)}%` }} />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-1 text-sm font-medium text-gray-500">Tasks Completed</p>
              <p className="text-3xl font-bold text-green-600">
                {tasksCompleted}<span className="text-base font-normal text-gray-400">/{tasksTotal}</span>
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-green-100">
                <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0, 100)}%` }} />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-1 text-sm font-medium text-gray-500">Time Saved by AI</p>
              <p className="text-3xl font-bold text-amber-500">
                {timeSaved}<span className="text-base font-normal text-gray-400">{' '}hrs</span>
              </p>
              <p className="mt-2 text-sm text-gray-400">Automated tasks &amp; drafts</p>
            </div>
          </div>
        )}
      </section>

      {/* TIME AUDIT */}
      <section>
        <SectionHeader title="Time Audit" />
        {timeAudit.loading ? (
          <TimeAuditSkeleton />
        ) : timeAudit.error ? (
          <SectionError message={timeAudit.error} onRetry={fetchTimeAudit} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Time Allocation</h3>
              <div className="space-y-3">
                {allocation.length > 0 ? (
                  allocation.map((entry) => {
                    const category = entry?.category ?? 'Unknown';
                    const pct = entry?.percentage ?? 0;
                    const color = entry?.color ?? DEFAULT_ALLOCATION_COLORS[category] ?? '#9ca3af';
                    return (
                      <div key={category} className="flex items-center gap-3">
                        <span className="w-20 truncate text-sm text-gray-600">{category}</span>
                        <div className="h-4 flex-1 rounded-full bg-gray-100">
                          <div className="h-4 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                        </div>
                        <span className="w-12 text-right text-sm font-medium text-gray-700">{pct}%</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-400">No allocation data available</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Intended vs Actual</h3>
              <div className="space-y-4">
                {comparison.length > 0 ? (
                  comparison.map((entry) => {
                    const category = entry?.category ?? 'Unknown';
                    const intended = entry?.intended ?? 0;
                    const actual = entry?.actual ?? 0;
                    const maxVal = Math.max(intended, actual, 1);
                    const isOver = actual > intended;
                    return (
                      <div key={category}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm text-gray-600">{category}</span>
                          <span className={`text-xs font-medium ${isOver ? 'text-red-500' : 'text-green-600'}`}>
                            {isOver ? '\u25B2' : '\u25CF'}{' '}
                            {isOver ? '+' + (actual - intended) + 'h over' : 'On track'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <div className="h-3 w-full rounded-full bg-gray-100">
                              <div className="h-3 rounded-full bg-blue-300 transition-all" style={{ width: `${(intended / maxVal) * 100}%` }} />
                            </div>
                            <p className="mt-0.5 text-xs text-gray-400">Intended: {intended}h</p>
                          </div>
                          <div className="flex-1">
                            <div className="h-3 w-full rounded-full bg-gray-100">
                              <div className={`h-3 rounded-full transition-all ${isOver ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${(actual / maxVal) * 100}%` }} />
                            </div>
                            <p className="mt-0.5 text-xs text-gray-400">Actual: {actual}h</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-400">No comparison data available</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* WEEKLY TRENDS */}
      <section>
        <SectionHeader title="Weekly Trends" />
        {productivity.loading ? (
          <TrendsSkeleton />
        ) : productivity.error ? (
          <SectionError message={productivity.error} onRetry={fetchProductivity} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Tasks Completed per Week</h3>
              {trendDirection !== 'stable' && (
                <span className={`text-sm font-medium ${trendDirection === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                  {trendDirection === 'up' ? '\u2191 Trending up' : '\u2193 Trending down'}
                </span>
              )}
            </div>
            {weeklyTrends.length > 0 ? (
              <div className="flex items-end justify-around gap-4" style={{ height: 180 }}>
                {weeklyTrends.map((week, idx) => {
                  const tasks = week?.tasksCompleted ?? 0;
                  const label = week?.week ?? ('W' + (idx + 1));
                  const barHeight = maxTasks > 0 ? (tasks / maxTasks) * 150 : 0;
                  return (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <span className="text-sm font-semibold text-gray-700">{tasks}</span>
                      <div className="w-14 rounded-t-lg bg-blue-500 transition-all" style={{ height: Math.max(barHeight, 4) }} />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">No trend data available</p>
            )}
          </div>
        )}
      </section>

      {/* AI ACCURACY */}
      <section>
        <SectionHeader title="AI Accuracy" />
        {aiAccuracy.loading ? (
          <AccuracySkeleton />
        ) : aiAccuracy.error ? (
          <SectionError message={aiAccuracy.error} onRetry={fetchAiAccuracy} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Triage Accuracy', value: triageAcc },
              { label: 'Draft Approval Rate', value: draftRate },
              { label: 'Prediction Quality', value: predQuality },
              { label: 'Classification Accuracy', value: classAcc },
            ].map(({ label, value }) => (
              <div
                key={label}
                className={`rounded-xl border border-gray-200 bg-white p-5 ring-1 ${getAccuracyRing(value)}`}
              >
                <p className="mb-2 text-sm font-medium text-gray-500">{label}</p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${getAccuracyColor(value)}`}>{value}</span>
                  <span className="text-base text-gray-400">%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      value >= 90 ? 'bg-green-500' : value >= 75 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
