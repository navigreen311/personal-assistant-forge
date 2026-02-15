'use client';

import type { ProfitAndLoss } from '@/modules/finance/types';

interface Props {
  pnl: ProfitAndLoss;
}

export default function PnLTable({ pnl }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Profit & Loss — {pnl.entityName}
        </h3>
        <p className="text-xs text-gray-500">
          {new Date(pnl.period.start).toLocaleDateString()} –{' '}
          {new Date(pnl.period.end).toLocaleDateString()}
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left">Category</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2 text-right">Previous</th>
            <th className="px-4 py-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100 bg-green-50">
            <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-green-700">
              Revenue
            </td>
          </tr>
          {pnl.revenue.map((item) => (
            <tr key={`rev-${item.category}`} className="border-b border-gray-50">
              <td className="px-4 py-2 pl-8 text-gray-700">{item.category}</td>
              <td className="px-4 py-2 text-right font-medium">${item.amount.toLocaleString()}</td>
              <td className="px-4 py-2 text-right text-gray-500">
                ${item.previousPeriodAmount.toLocaleString()}
              </td>
              <td className={`px-4 py-2 text-right text-xs font-medium ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {item.changePercent >= 0 ? '+' : ''}{item.changePercent}%
              </td>
            </tr>
          ))}
          <tr className="border-b border-gray-200 bg-gray-50 font-semibold">
            <td className="px-4 py-2">Total Revenue</td>
            <td className="px-4 py-2 text-right">${pnl.totalRevenue.toLocaleString()}</td>
            <td colSpan={2} />
          </tr>

          <tr className="border-b border-gray-100 bg-red-50">
            <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-red-700">
              Expenses
            </td>
          </tr>
          {pnl.expenses.map((item) => (
            <tr key={`exp-${item.category}`} className="border-b border-gray-50">
              <td className="px-4 py-2 pl-8 text-gray-700">{item.category}</td>
              <td className="px-4 py-2 text-right font-medium">${item.amount.toLocaleString()}</td>
              <td className="px-4 py-2 text-right text-gray-500">
                ${item.previousPeriodAmount.toLocaleString()}
              </td>
              <td className={`px-4 py-2 text-right text-xs font-medium ${item.changePercent <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {item.changePercent >= 0 ? '+' : ''}{item.changePercent}%
              </td>
            </tr>
          ))}
          <tr className="border-b border-gray-200 bg-gray-50 font-semibold">
            <td className="px-4 py-2">Total Expenses</td>
            <td className="px-4 py-2 text-right">${pnl.totalExpenses.toLocaleString()}</td>
            <td colSpan={2} />
          </tr>

          <tr className="bg-gray-100 text-lg font-bold">
            <td className="px-4 py-3">Gross Profit</td>
            <td className={`px-4 py-3 text-right ${pnl.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              ${pnl.grossProfit.toLocaleString()}
            </td>
            <td className="px-4 py-3 text-right text-sm text-gray-600">Margin:</td>
            <td className="px-4 py-3 text-right text-sm font-semibold">
              {pnl.grossMargin.toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
