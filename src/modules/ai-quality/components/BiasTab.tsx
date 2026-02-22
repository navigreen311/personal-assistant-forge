'use client';

import { useEffect, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BiasTabProps {
  entityId?: string;
  period?: string;
}

interface DemographicRow {
  gender: string;
  avgFormality: number;
  avgLength: number;
  responseTime: number;
}

interface EntityPriorityRow {
  entity: string;
  avgPriorityScore: number;
  overrideRate: number;
}

interface SentimentBalance {
  positive: number;
  neutral: number;
  negative: number;
}

interface ContentFilteringStats {
  promptInjectionBlocked: number;
  harmfulContentBlocked: number;
  piiAutoRedacted: number;
}

interface BiasData {
  demographic: {
    rows: DemographicRow[];
    verdict: 'pass' | 'warn';
    verdictMessage: string;
  };
  priorityClassification: {
    rows: EntityPriorityRow[];
    warnings: string[];
  };
  sentimentBalance: {
    current: SentimentBalance;
    benchmark: SentimentBalance;
    verdict: 'pass' | 'warn';
    verdictMessage: string;
  };
  contentFiltering: ContentFilteringStats;
}
// ---------------------------------------------------------------------------
// Demo Fallback Data
// ---------------------------------------------------------------------------

const DEMO_DATA: BiasData = {
  demographic: {
    rows: [
      { gender: 'Male', avgFormality: 6.8, avgLength: 142, responseTime: 12.3 },
      { gender: 'Female', avgFormality: 6.9, avgLength: 138, responseTime: 11.8 },
      { gender: 'Unknown', avgFormality: 6.7, avgLength: 145, responseTime: 13.1 },
    ],
    verdict: 'pass',
    verdictMessage: 'No significant bias detected',
  },
  priorityClassification: {
    rows: [
      { entity: 'CRE Forge', avgPriorityScore: 7.2, overrideRate: 12.4 },
      { entity: 'Shadow Systems', avgPriorityScore: 6.8, overrideRate: 4.1 },
      { entity: 'Personal', avgPriorityScore: 5.3, overrideRate: 6.7 },
    ],
    warnings: [
      'CRE Forge has higher override rate — may indicate entity-specific prompt tuning needed',
    ],
  },
  sentimentBalance: {
    current: { positive: 42, neutral: 45, negative: 13 },
    benchmark: { positive: 40, neutral: 48, negative: 12 },
    verdict: 'pass',
    verdictMessage: 'Within normal range',
  },
  contentFiltering: {
    promptInjectionBlocked: 3,
    harmfulContentBlocked: 0,
    piiAutoRedacted: 17,
  },
};

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonTable({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-48 rounded bg-gray-200" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 flex-1 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBar() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
      <div className="h-8 w-full rounded-full bg-gray-100" />
      <div className="mt-3 h-8 w-full rounded-full bg-gray-100" />
    </div>
  );
}

function SkeletonStats() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-36 rounded bg-gray-200" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="text-center">
            <div className="mx-auto mb-2 h-8 w-12 rounded bg-gray-200" />
            <div className="mx-auto h-3 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BiasTab({ entityId, period }: BiasTabProps) {
  const [data, setData] = useState<BiasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch(`/api/analytics/bias?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load bias data (${res.status})`);

      const json = await res.json();
      setData(json ?? DEMO_DATA);
    } catch {
      // Fall back to demo data on error
      setData(DEMO_DATA);
    } finally {
      setLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-800">
          Failed to load bias detection data
        </p>
        <p className="mt-1 text-xs text-red-600">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  if (!loading && !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Bias Detection &amp; Fairness
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
          </svg>
          <p className="mt-4 text-sm text-gray-500">
            No bias analysis data available yet. Data will appear here once the AI has processed enough interactions.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading Skeleton
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-56 animate-pulse rounded bg-gray-200" />
        <SkeletonTable rows={3} />
        <SkeletonTable rows={3} />
        <SkeletonBar />
        <SkeletonStats />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived values (safe with optional chaining and demo fallback)
  // ---------------------------------------------------------------------------

  const demographic = data?.demographic ?? DEMO_DATA.demographic;
  const priorityClassification = data?.priorityClassification ?? DEMO_DATA.priorityClassification;
  const sentimentBalance = data?.sentimentBalance ?? DEMO_DATA.sentimentBalance;
  const contentFiltering = data?.contentFiltering ?? DEMO_DATA.contentFiltering;
  const currentSentiment = sentimentBalance?.current ?? DEMO_DATA.sentimentBalance.current;
  const benchmarkSentiment = sentimentBalance?.benchmark ?? DEMO_DATA.sentimentBalance.benchmark;
  const hasHighOverrideRate = (priorityClassification?.rows ?? []).some((r) => (r?.overrideRate ?? 0) > 10);
  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-lg font-semibold text-gray-900">
        Bias Detection &amp; Fairness
      </h2>

      {/* DEMOGRAPHIC ANALYSIS */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-900">
          Demographic Analysis
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          Communication tone by contact gender
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-3 pr-4">Gender</th>
                <th className="pb-3 pr-4 text-right">Avg Formality (X/10)</th>
                <th className="pb-3 pr-4 text-right">Avg Length (words)</th>
                <th className="pb-3 text-right">Response Time (seconds)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(demographic?.rows ?? []).map((row) => (
                <tr key={row?.gender ?? 'unknown'} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{row?.gender ?? 'Unknown'}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-600">{(row?.avgFormality ?? 0).toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-600">{row?.avgLength ?? 0}</td>
                  <td className="py-2.5 text-right text-gray-600">{(row?.responseTime ?? 0).toFixed(1)}</td>
                </tr>
              ))}
              {(demographic?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-400">No demographic data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Verdict Badge */}
        <div className="mt-4">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              demographic?.verdict === 'pass'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {demographic?.verdict === 'pass' ? (
              <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            ) : (
              <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            )}
            {demographic?.verdictMessage ?? 'No significant bias detected'}
          </span>
        </div>
      </div>
      {/* PRIORITY CLASSIFICATION BY ENTITY */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-900">
          Priority Classification by Entity
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          Average priority scores and override rates across entities
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-3 pr-4">Entity</th>
                <th className="pb-3 pr-4 text-right">Avg Priority Score</th>
                <th className="pb-3 text-right">Override Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(priorityClassification?.rows ?? []).map((row) => {
                const isHighOverride = (row?.overrideRate ?? 0) > 10;
                return (
                  <tr key={row?.entity ?? 'unknown'} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{row?.entity ?? 'Unknown'}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-600">{(row?.avgPriorityScore ?? 0).toFixed(1)}</td>
                    <td className="py-2.5 text-right">
                      <span className={`font-medium ${isHighOverride ? 'text-amber-600' : 'text-gray-600'}`}>
                        {(row?.overrideRate ?? 0).toFixed(1)}%
                      </span>
                      {isHighOverride && (
                        <svg className="ml-1 inline-block h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(priorityClassification?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-gray-400">No entity priority data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Override warnings */}
        {hasHighOverrideRate && (priorityClassification?.warnings ?? []).length > 0 && (
          <div className="mt-4 space-y-2">
            {(priorityClassification?.warnings ?? []).map((warning, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-amber-800">{warning}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* SENTIMENT BALANCE */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-900">
          Sentiment Balance
        </h3>
        <p className="mb-4 text-xs text-gray-500">Distribution of AI response sentiment</p>

        {/* Current sentiment bar */}
        <p className="mb-1.5 text-xs font-medium text-gray-600">Current</p>
        <div className="flex h-8 w-full overflow-hidden rounded-full bg-gray-100">
          {(currentSentiment?.positive ?? 0) > 0 && (
            <div className="flex items-center justify-center text-xs font-medium text-white transition-all" style={{ width: `${currentSentiment?.positive ?? 0}%`, backgroundColor: '#22c55e' }} title={`Positive: ${currentSentiment?.positive ?? 0}%`}>
              {(currentSentiment?.positive ?? 0) >= 10 && `${currentSentiment?.positive ?? 0}%`}
            </div>
          )}
          {(currentSentiment?.neutral ?? 0) > 0 && (
            <div className="flex items-center justify-center text-xs font-medium text-white transition-all" style={{ width: `${currentSentiment?.neutral ?? 0}%`, backgroundColor: '#9ca3af' }} title={`Neutral: ${currentSentiment?.neutral ?? 0}%`}>
              {(currentSentiment?.neutral ?? 0) >= 10 && `${currentSentiment?.neutral ?? 0}%`}
            </div>
          )}
          {(currentSentiment?.negative ?? 0) > 0 && (
            <div className="flex items-center justify-center text-xs font-medium text-white transition-all" style={{ width: `${currentSentiment?.negative ?? 0}%`, backgroundColor: '#ef4444' }} title={`Negative: ${currentSentiment?.negative ?? 0}%`}>
              {(currentSentiment?.negative ?? 0) >= 10 && `${currentSentiment?.negative ?? 0}%`}
            </div>
          )}
        </div>

        {/* Industry benchmark bar */}
        <p className="mt-4 mb-1.5 text-xs font-medium text-gray-600">Industry Benchmark</p>
        <div className="flex h-8 w-full overflow-hidden rounded-full bg-gray-100">
          {(benchmarkSentiment?.positive ?? 0) > 0 && (
            <div className="flex items-center justify-center text-xs font-medium text-white/80 transition-all" style={{ width: `${benchmarkSentiment?.positive ?? 0}%`, backgroundColor: '#86efac' }} title={`Benchmark Positive: ${benchmarkSentiment?.positive ?? 0}%`}>
              {(benchmarkSentiment?.positive ?? 0) >= 10 && `${benchmarkSentiment?.positive ?? 0}%`}
            </div>
          )}
          {(benchmarkSentiment?.neutral ?? 0) > 0 && (
            <div className="flex items-center justify-center text-xs font-medium text-white/80 transition-all" style={{ width: `${benchmarkSentiment?.neutral ?? 0}%`, backgroundColor: '#d1d5db' }} title={`Benchmark Neutral: ${benchmarkSentiment?.neutral ?? 0}%`}>
              {(benchmarkSentiment?.neutral ?? 0) >= 10 && `${benchmarkSentiment?.neutral ?? 0}%`}
            </div>
          )}
          {(benchmarkSentiment?.negative ?? 0) > 0 && (
            <div className="flex items-center justify-center text-xs font-medium text-white/80 transition-all" style={{ width: `${benchmarkSentiment?.negative ?? 0}%`, backgroundColor: '#fca5a5' }} title={`Benchmark Negative: ${benchmarkSentiment?.negative ?? 0}%`}>
              {(benchmarkSentiment?.negative ?? 0) >= 10 && `${benchmarkSentiment?.negative ?? 0}%`}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-xs text-gray-600">Positive</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#9ca3af' }} />
            <span className="text-xs text-gray-600">Neutral</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#ef4444' }} />
            <span className="text-xs text-gray-600">Negative</span>
          </div>
        </div>

        {/* Sentiment Verdict Badge */}
        <div className="mt-4">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${sentimentBalance?.verdict === 'pass' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {sentimentBalance?.verdict === 'pass' ? (
              <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            ) : (
              <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            )}
            {sentimentBalance?.verdictMessage ?? 'Within normal range'}
          </span>
        </div>
      </div>
      {/* CONTENT FILTERING */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-900">
          Content Filtering
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{contentFiltering?.promptInjectionBlocked ?? 0}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">Prompt injection attempts blocked</p>
            <p className="text-xs text-gray-400">this month</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{contentFiltering?.harmfulContentBlocked ?? 0}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">Harmful content blocked</p>
            <p className="text-xs text-gray-400">this month</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{contentFiltering?.piiAutoRedacted ?? 0}</p>
            <p className="mt-1 text-xs font-medium text-gray-500">PII auto-redacted</p>
            <p className="text-xs text-gray-400">this month</p>
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => alert('Configure bias thresholds — coming soon')}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Configure bias thresholds
        </button>
        <button
          onClick={() => alert('Download report — coming soon')}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Download report
        </button>
      </div>
    </div>
  );
}
