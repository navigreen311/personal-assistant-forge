'use client';

import type { BudgetCategory } from '@/modules/finance/types';

interface Props {
  category: BudgetCategory;
}

export default function BudgetForecastRow({ category }: Props) {
  const forecastPercent =
    category.budgeted === 0 ? 0 : (category.forecast / category.budgeted) * 100;
  const willExceed = forecastPercent > 100;

  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{category.category}</td>
      <td className="px-4 py-3 text-right text-sm">
        ${category.budgeted.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right text-sm">
        ${category.spent.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right text-sm">
        ${category.remaining.toLocaleString()}
      </td>
      <td className={`px-4 py-3 text-right text-sm font-medium ${willExceed ? 'text-red-600' : 'text-gray-900'}`}>
        ${category.forecast.toLocaleString()}
        {willExceed && (
          <span className="ml-1 text-xs text-red-500">({forecastPercent.toFixed(0)}%)</span>
        )}
      </td>
    </tr>
  );
}
