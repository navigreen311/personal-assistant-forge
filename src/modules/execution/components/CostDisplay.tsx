'use client';

import type { CostEstimate } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CostDisplayProps {
  estimate: CostEstimate;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH_COST_THRESHOLD = 1; // in the estimate's currency unit

interface ConfidenceMeta {
  label: string;
  color: string;
  bgColor: string;
  barWidth: string;
}

function getConfidenceMeta(confidence: number): ConfidenceMeta {
  if (confidence >= 0.7) {
    return {
      label: 'High',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500',
      barWidth: '100%',
    };
  }
  if (confidence >= 0.4) {
    return {
      label: 'Medium',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500',
      barWidth: '66%',
    };
  }
  return {
    label: 'Low',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500',
    barWidth: '33%',
  };
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    // Fallback for unknown currency codes
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CostDisplay({ estimate }: CostDisplayProps) {
  const { estimatedCost, currency, breakdown, confidence, actionType } = estimate;
  const isHighCost = estimatedCost > HIGH_COST_THRESHOLD;
  const confidenceMeta = getConfidenceMeta(confidence);

  return (
    <div className="w-full space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header row: total cost + action type */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Estimated Cost
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              isHighCost
                ? 'text-red-600 dark:text-red-400'
                : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {formatCurrency(estimatedCost, currency)}
          </p>
        </div>

        <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {actionType.replace(/_/g, ' ')}
        </span>
      </div>

      {/* High-cost warning */}
      {isHighCost && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0 text-red-500"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-xs font-medium text-red-700 dark:text-red-400">
              High-cost action
            </p>
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">
              This action exceeds the ${HIGH_COST_THRESHOLD.toFixed(2)} cost threshold. Please
              review the breakdown below before proceeding.
            </p>
          </div>
        </div>
      )}

      {/* Confidence indicator */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Confidence</span>
          <span className={`text-xs font-medium ${confidenceMeta.color}`}>
            {confidenceMeta.label} ({Math.round(confidence * 100)}%)
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={`h-full rounded-full transition-all duration-300 ${confidenceMeta.bgColor}`}
            style={{ width: confidenceMeta.barWidth }}
          />
        </div>
      </div>

      {/* Breakdown table */}
      {breakdown.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                <th className="px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Item
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Cost
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Unit
                </th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((item) => (
                <tr
                  key={item.item}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-700/50"
                >
                  <td className="px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {item.item}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm text-zinc-600 dark:text-zinc-400">
                    {formatCurrency(item.cost, currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                <td className="px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Total
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono text-sm font-semibold ${
                    isHighCost
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {formatCurrency(estimatedCost, currency)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
