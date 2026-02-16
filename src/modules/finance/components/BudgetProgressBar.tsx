'use client';

import type { BudgetCategory } from '@/modules/finance/types';

interface Props {
  category: BudgetCategory;
}

function getColor(percentUsed: number): string {
  if (percentUsed >= 100) return 'bg-red-500';
  if (percentUsed >= 80) return 'bg-orange-500';
  if (percentUsed >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getAlertLabel(alert: BudgetCategory['alert']): string {
  if (alert === 'OVER_BUDGET') return 'Over Budget';
  if (alert === 'WARNING') return 'Warning';
  return 'On Track';
}

function getAlertColor(alert: BudgetCategory['alert']): string {
  if (alert === 'OVER_BUDGET') return 'text-red-600';
  if (alert === 'WARNING') return 'text-orange-600';
  return 'text-green-600';
}

export default function BudgetProgressBar({ category }: Props) {
  const barWidth = Math.min(100, category.percentUsed);

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">{category.category}</span>
        <span className={`text-xs font-medium ${getAlertColor(category.alert)}`}>
          {getAlertLabel(category.alert)}
        </span>
      </div>
      <div className="mb-1 h-4 w-full rounded-full bg-gray-100">
        <div
          className={`h-4 rounded-full ${getColor(category.percentUsed)}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>
          ${category.spent.toLocaleString()} / ${category.budgeted.toLocaleString()}
        </span>
        <span>{category.percentUsed.toFixed(1)}% used</span>
      </div>
      <div className="mt-1 text-xs text-gray-400">
        Remaining: ${category.remaining.toLocaleString()}
      </div>
    </div>
  );
}
