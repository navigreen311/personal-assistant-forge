'use client';

import type { ExpenseByCategory } from '@/modules/finance/types';

interface Props {
  categories: ExpenseByCategory[];
}

const trendIcons = { UP: '\u2191', DOWN: '\u2193', STABLE: '\u2192' };
const trendColors = { UP: 'text-red-600', DOWN: 'text-green-600', STABLE: 'text-gray-500' };

export default function CategoryBreakdown({ categories }: Props) {
  const sorted = [...categories].sort((a, b) => b.total - a.total);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-gray-700">Expenses by Category</h4>
      <div className="space-y-3">
        {sorted.map((cat) => (
          <div key={cat.category}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-900">{cat.category}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${trendColors[cat.trend]}`}>
                  {trendIcons[cat.trend]} {cat.changePercent > 0 ? '+' : ''}{cat.changePercent}%
                </span>
                <span className="font-medium">${cat.total.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-100">
              <div
                className="h-3 rounded-full bg-blue-500"
                style={{ width: `${Math.min(100, cat.percentageOfTotal)}%` }}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-xs text-gray-500">
              <span>{cat.count} transactions</span>
              <span>{cat.percentageOfTotal}%</span>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">No data available</p>
        )}
      </div>
    </div>
  );
}
