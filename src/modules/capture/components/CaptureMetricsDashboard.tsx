'use client';

import type { CaptureLatencyMetrics, CaptureItem } from '@/modules/capture/types';

interface CaptureMetricsDashboardProps {
  metrics: CaptureLatencyMetrics[];
  captures: CaptureItem[];
}

export default function CaptureMetricsDashboard({
  metrics,
  captures,
}: CaptureMetricsDashboardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCaptures = captures.filter((c) => c.createdAt >= today);
  const autoRouted = todayCaptures.filter(
    (c) => c.status === 'ROUTED' && (c.routingResult?.appliedRules.length ?? 0) > 0,
  );
  const manualNeeded = todayCaptures.filter(
    (c) => c.status === 'ROUTED' && (c.routingResult?.appliedRules.length ?? 0) === 0,
  );

  const autoRoutedPct =
    todayCaptures.length > 0
      ? Math.round((autoRouted.length / todayCaptures.length) * 100)
      : 0;
  const manualPct =
    todayCaptures.length > 0
      ? Math.round((manualNeeded.length / todayCaptures.length) * 100)
      : 0;

  // Average latency
  const avgTotal =
    metrics.length > 0
      ? Math.round(metrics.reduce((sum, m) => sum + m.totalMs, 0) / metrics.length)
      : 0;

  // Breakdown by source
  const bySource = groupBy(metrics, (m) => m.source);
  const byContentType = groupBy(metrics, (m) => m.contentType);

  return (
    <div className="space-y-4">
      {/* Summary counters */}
      <div className="grid grid-cols-3 gap-3">
        <CounterCard label="Captures Today" value={todayCaptures.length} />
        <CounterCard label="Auto-routed" value={`${autoRoutedPct}%`} />
        <CounterCard label="Manual Needed" value={`${manualPct}%`} />
      </div>

      {/* Average latency */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Average Latency
        </h3>
        <div className="text-2xl font-bold text-gray-900">
          {avgTotal}ms
        </div>
        <p className="text-xs text-gray-500">capture → processed → routed</p>
      </div>

      {/* By Source */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Latency by Source
        </h3>
        <div className="space-y-2">
          {Object.entries(bySource).map(([source, items]) => {
            const avg = Math.round(
              items.reduce((s, m) => s + m.totalMs, 0) / items.length,
            );
            const maxVal = Math.max(
              ...Object.values(bySource).map((arr) =>
                Math.round(arr.reduce((s, m) => s + m.totalMs, 0) / arr.length),
              ),
            );
            return (
              <BarRow
                key={source}
                label={source}
                value={avg}
                maxValue={maxVal}
                unit="ms"
              />
            );
          })}
          {Object.keys(bySource).length === 0 && (
            <p className="text-xs text-gray-400">No data yet</p>
          )}
        </div>
      </div>

      {/* By Content Type */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Latency by Content Type
        </h3>
        <div className="space-y-2">
          {Object.entries(byContentType).map(([type, items]) => {
            const avg = Math.round(
              items.reduce((s, m) => s + m.totalMs, 0) / items.length,
            );
            const maxVal = Math.max(
              ...Object.values(byContentType).map((arr) =>
                Math.round(arr.reduce((s, m) => s + m.totalMs, 0) / arr.length),
              ),
            );
            return (
              <BarRow
                key={type}
                label={type}
                value={avg}
                maxValue={maxVal}
                unit="ms"
              />
            );
          })}
          {Object.keys(byContentType).length === 0 && (
            <p className="text-xs text-gray-400">No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CounterCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function BarRow({
  label,
  value,
  maxValue,
  unit,
}: {
  label: string;
  value: number;
  maxValue: number;
  unit: string;
}) {
  const widthPct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 truncate text-xs text-gray-600">{label}</span>
      <div className="flex-1">
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${widthPct}%` }}
          />
        </div>
      </div>
      <span className="w-16 text-right text-xs text-gray-600">
        {value}{unit}
      </span>
    </div>
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}
