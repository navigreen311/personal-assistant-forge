'use client';

import type { CostBreakdownItem } from '@/modules/billing/types';

// --- Props ---

interface CostBreakdownChartProps {
  items: CostBreakdownItem[];
  loading?: boolean;
}

// --- Trend helpers ---

const trendIcons: Record<CostBreakdownItem['trend'], string> = {
  up: '\u2191',
  down: '\u2193',
  stable: '\u2192',
};

const trendColors: Record<CostBreakdownItem['trend'], string> = {
  up: 'text-red-600',
  down: 'text-green-600',
  stable: 'text-gray-500',
};

// --- Bar colors (cycle through for visual distinction) ---

const barColors = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-teal-500',
];

// --- Skeleton ---

function CostBreakdownSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-md">
      <div className="animate-pulse h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="animate-pulse h-4 w-24 bg-gray-200 rounded" />
              <div className="animate-pulse h-4 w-16 bg-gray-200 rounded" />
            </div>
            <div className="animate-pulse h-3 w-full bg-gray-200 rounded-full" />
            <div className="flex justify-between">
              <div className="animate-pulse h-3 w-20 bg-gray-200 rounded" />
              <div className="animate-pulse h-3 w-12 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Component ---

export default function CostBreakdownChart({ items, loading }: CostBreakdownChartProps) {
  if (loading) {
    return <CostBreakdownSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-md">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">Cost Breakdown by Module</h4>
        <p className="py-4 text-center text-sm text-gray-400">No cost data available</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const totalCost = sorted.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Cost Breakdown by Module</h4>
        <span className="text-sm font-bold text-gray-900">
          ${totalCost.toFixed(2)} total
        </span>
      </div>

      {/* Stacked bar summary */}
      <div className="mb-5 h-4 w-full rounded-full bg-gray-100 overflow-hidden flex">
        {sorted.map((item, idx) => (
          <div
            key={item.category}
            className={`h-full ${barColors[idx % barColors.length]} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${Math.max(item.percentage, 1)}%` }}
            title={`${item.category}: ${item.percentage}%`}
          />
        ))}
      </div>

      {/* Detailed breakdown */}
      <div className="space-y-3">
        {sorted.map((item, idx) => (
          <div key={item.category}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 rounded-sm ${barColors[idx % barColors.length]}`}
                />
                <span className="font-medium text-gray-900">{item.category}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${trendColors[item.trend]}`}>
                  {trendIcons[item.trend]}{' '}
                  {item.changePercent > 0 ? '+' : ''}
                  {item.changePercent}%
                </span>
                <span className="font-medium text-gray-900">${item.amount.toFixed(2)}</span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className={`h-2 rounded-full ${barColors[idx % barColors.length]} transition-all duration-300`}
                style={{ width: `${Math.min(100, item.percentage)}%` }}
              />
            </div>
            <div className="mt-0.5 text-right text-xs text-gray-500">
              {item.percentage.toFixed(1)}% of total
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { CostBreakdownSkeleton };
