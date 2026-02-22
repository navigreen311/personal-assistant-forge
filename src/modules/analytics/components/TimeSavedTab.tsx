"use client";

import { useState, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeSavedTabProps {
  entityId?: string;
  period?: string;
}

interface ActivityBreakdown {
  activity: string;
  hoursSaved: number;
  description: string;
}

interface WeeklyTrendEntry {
  weekStart: string;
  hoursSaved: number;
}

interface EntityBreakdown {
  entityId: string;
  entityName: string;
  hoursSaved: number;
  topActivity: string;
}

interface TimeSavedData {
  thisWeekHours: number;
  thisMonthHours: number;
  allTimeHours: number;
  activities: ActivityBreakdown[];
  weeklyTrend: WeeklyTrendEntry[];
  entityBreakdown: EntityBreakdown[];
  monthlyAverage: number;
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function ClockIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function EnvelopeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function PencilIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function CheckCircleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CalendarIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function PhoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
    </svg>
  );
}

function DatabaseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  );
}

function SearchIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Activity Icon Lookup
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  "Email triage": EnvelopeIcon,
  "Draft generation": PencilIcon,
  "Task creation": CheckCircleIcon,
  "Meeting prep": CalendarIcon,
  "Voice calls": PhoneIcon,
  "Data entry": DatabaseIcon,
  Research: SearchIcon,
};

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
      <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-24 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-16 bg-gray-200 rounded" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
      <div className="h-4 w-48 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-4 bg-gray-200 rounded" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-4 flex-1 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBars() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
      <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
      <div className="flex items-end gap-3 h-40">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end h-full"
          >
            <div
              className="w-full bg-gray-200 rounded-t"
              style={{ height: `${30 + i * 8}%` }}
            />
            <div className="h-3 w-10 bg-gray-200 rounded mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonInsight() {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 bg-green-200 rounded-full" />
        <div className="h-4 flex-1 bg-green-200 rounded" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar Color Gradient
// ---------------------------------------------------------------------------

const BAR_COLORS = [
  "bg-blue-200",
  "bg-blue-300",
  "bg-blue-350",
  "bg-blue-400",
  "bg-blue-450",
  "bg-blue-500",
  "bg-blue-600",
  "bg-blue-700",
];

function getBarColor(index: number, total: number): string {
  const colorIndex = Math.round(
    (index / Math.max(total - 1, 1)) * (BAR_COLORS.length - 1)
  );
  return BAR_COLORS[colorIndex] ?? "bg-blue-500";
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TimeSavedTab({ entityId, period }: TimeSavedTabProps) {
  const [data, setData] = useState<TimeSavedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch time-saved data ---
  useEffect(() => {
    async function fetchTimeSaved() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (entityId) params.set("entityId", entityId);
        if (period) params.set("period", period);
        const qs = params.toString();
        const url = `/api/analytics/time-saved${qs ? `?${qs}` : ""}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch time-saved data (${res.status})`);
        }
        const json = await res.json();
        setData(json?.data ?? json ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchTimeSaved();
  }, [entityId, period]);

  // --- Computed insight text ---
  const insightText = useMemo(() => {
    const monthlyAvg = data?.monthlyAverage ?? data?.thisMonthHours ?? 0;
    if (monthlyAvg <= 0) return null;

    const hoursPerWorkDay = 8;
    const daysEquivalent = monthlyAvg / hoursPerWorkDay;

    if (daysEquivalent >= 1) {
      return `At this rate, AI saves you ~${daysEquivalent.toFixed(1)} full work day${daysEquivalent >= 1.5 ? "s" : ""} per month.`;
    }
    return `At this rate, AI saves you ~${monthlyAvg.toFixed(1)} hours per month — keep building automations to save even more.`;
  }, [data]);

  // --- Max hours in weekly trend (for bar scaling) ---
  const maxTrendHours = useMemo(() => {
    if (!data?.weeklyTrend?.length) return 1;
    return Math.max(...data.weeklyTrend.map((w) => w?.hoursSaved ?? 0), 1);
  }, [data]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Summary cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Activity table skeleton */}
        <SkeletonTable />

        {/* Weekly trend skeleton */}
        <SkeletonBars />

        {/* Insight skeleton */}
        <SkeletonInsight />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ClockIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Time Saved by AI</h2>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  if (
    !data ||
    ((data?.thisWeekHours ?? 0) === 0 &&
      (data?.thisMonthHours ?? 0) === 0 &&
      (data?.allTimeHours ?? 0) === 0 &&
      (data?.activities?.length ?? 0) === 0)
  ) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ClockIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Time Saved by AI</h2>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
          <ClockIcon className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">
            No time saved data yet. As AI handles tasks for you, savings will
            appear here.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const thisWeek = data?.thisWeekHours ?? 0;
  const thisMonth = data?.thisMonthHours ?? 0;
  const allTime = data?.allTimeHours ?? 0;
  const activities = data?.activities ?? [];
  const weeklyTrend = data?.weeklyTrend ?? [];
  const entityBreakdown = data?.entityBreakdown ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ClockIcon className="w-6 h-6 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Time Saved by AI</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* This Week */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
          <p className="text-sm font-medium text-blue-500 uppercase tracking-wide">
            This Week
          </p>
          <p className="mt-2 text-4xl font-bold text-blue-600">
            {thisWeek.toFixed(1)}
          </p>
          <p className="mt-1 text-sm text-blue-500">hours saved</p>
        </div>

        {/* This Month */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-sm font-medium text-green-500 uppercase tracking-wide">
            This Month
          </p>
          <p className="mt-2 text-4xl font-bold text-green-600">
            {thisMonth.toFixed(1)}
          </p>
          <p className="mt-1 text-sm text-green-500">hours saved</p>
        </div>

        {/* All Time */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-6 text-center">
          <p className="text-sm font-medium text-purple-500 uppercase tracking-wide">
            All Time
          </p>
          <p className="mt-2 text-4xl font-bold text-purple-600">
            {allTime.toFixed(0)}
          </p>
          <p className="mt-1 text-sm text-purple-500">hours saved</p>
        </div>
      </div>

      {/* Breakdown by Activity Table */}
      {activities.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Breakdown by Activity
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Activity
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Time Saved
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    How
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activities.map((act) => {
                  const IconComponent =
                    ACTIVITY_ICONS[act?.activity ?? ""] ?? ClockIcon;
                  return (
                    <tr
                      key={act?.activity ?? "unknown"}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-gray-400">
                            <IconComponent className="w-4 h-4" />
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {act?.activity ?? "Unknown"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm font-semibold text-gray-900">
                          {(act?.hoursSaved ?? 0).toFixed(1)}h
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm text-gray-600">
                          {act?.description ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weekly Trend (Bar Chart using divs) */}
      {weeklyTrend.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Weekly Trend
          </h3>
          <div className="flex items-end gap-3" style={{ height: "200px" }}>
            {weeklyTrend.map((week, idx) => {
              const hours = week?.hoursSaved ?? 0;
              const heightPercent =
                maxTrendHours > 0 ? (hours / maxTrendHours) * 100 : 0;
              const barColor = getBarColor(idx, weeklyTrend.length);

              return (
                <div
                  key={week?.weekStart ?? idx}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                >
                  {/* Hours label above bar */}
                  <span className="text-xs font-medium text-gray-700 mb-1">
                    {hours.toFixed(1)}h
                  </span>
                  {/* Bar */}
                  <div
                    className={`w-full rounded-t ${barColor} transition-all duration-300`}
                    style={{
                      height: `${Math.max(heightPercent, 2)}%`,
                      minHeight: "4px",
                    }}
                  />
                  {/* Week label */}
                  <span className="mt-2 text-xs text-gray-500 truncate w-full text-center">
                    {week?.weekStart ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entity Breakdown (only when no entity filter is selected) */}
      {!entityId && entityBreakdown.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Breakdown by Entity
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Entity
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Hours Saved
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Top Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entityBreakdown.map((entity) => (
                  <tr
                    key={entity?.entityId ?? "unknown"}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <span className="text-sm font-medium text-gray-900">
                        {entity?.entityName ?? "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {(entity?.hoursSaved ?? 0).toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-gray-600">
                        {entity?.topActivity ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Insight Card */}
      {insightText && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <ClockIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-800">{insightText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
