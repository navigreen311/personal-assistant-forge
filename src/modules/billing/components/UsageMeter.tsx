'use client';

import type { UsageData } from '@/modules/billing/types';

// --- Props ---

interface UsageMeterProps {
  usage: UsageData | null;
  loading?: boolean;
}

interface MeterItemProps {
  label: string;
  used: number;
  limit: number;
  format: (v: number) => string;
}

// --- Skeleton ---

function UsageMeterSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border border-gray-200 rounded-lg shadow-md space-y-2">
          <div className="animate-pulse h-4 w-20 bg-gray-200 rounded" />
          <div className="animate-pulse h-6 w-32 bg-gray-200 rounded" />
          <div className="animate-pulse h-2 w-full bg-gray-200 rounded-full" />
          <div className="animate-pulse h-3 w-16 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// --- Meter Item ---

function MeterItem({ label, used, limit, format }: MeterItemProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const barColor =
    pct > 90
      ? 'bg-red-500'
      : pct > 70
        ? 'bg-yellow-500'
        : 'bg-blue-500';

  const textColor =
    pct > 90
      ? 'text-red-600'
      : pct > 70
        ? 'text-yellow-600'
        : 'text-gray-500';

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-md">
      <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">
        {format(used)}{' '}
        <span className="text-sm font-normal text-gray-400">/ {format(limit)}</span>
      </p>
      <div
        className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} usage`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs mt-1 ${textColor}`}>
        {pct}% used
        {pct > 90 && ' — approaching limit'}
        {pct > 70 && pct <= 90 && ' — moderate usage'}
      </p>
    </div>
  );
}

// --- Component ---

export default function UsageMeter({ usage, loading }: UsageMeterProps) {
  if (loading) {
    return <UsageMeterSkeleton />;
  }

  if (!usage) {
    return (
      <p className="text-sm text-gray-500 py-4">No usage data available.</p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MeterItem
        label="AI Tokens"
        used={usage.aiTokens.used}
        limit={usage.aiTokens.limit}
        format={(v) => v.toLocaleString()}
      />
      <MeterItem
        label="API Calls"
        used={usage.apiCalls.used}
        limit={usage.apiCalls.limit}
        format={(v) => v.toLocaleString()}
      />
      <MeterItem
        label="Storage"
        used={usage.storage.used}
        limit={usage.storage.limit}
        format={(v) => `${v} GB`}
      />
    </div>
  );
}

export { UsageMeterSkeleton };
