'use client';

import type { CashFlowProjection } from '@/modules/finance/types';

interface Props {
  projections: CashFlowProjection[];
}

export default function CashFlowTimeline({ projections }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">Inflows</th>
            <th className="px-4 py-3 text-right">Outflows</th>
            <th className="px-4 py-3 text-right">Net</th>
            <th className="px-4 py-3 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {projections.map((proj, i) => {
            const isNegativeBalance = proj.runningBalance < 0;
            return (
              <tr key={i} className={isNegativeBalance ? 'bg-red-50' : ''}>
                <td className="px-4 py-2 text-gray-700">
                  {new Date(proj.date).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right text-green-600">
                  +${proj.expectedInflows.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right text-red-600">
                  -${proj.expectedOutflows.toLocaleString()}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${proj.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {proj.netCashFlow >= 0 ? '+' : ''}${proj.netCashFlow.toLocaleString()}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${isNegativeBalance ? 'text-red-700' : 'text-gray-900'}`}>
                  ${proj.runningBalance.toLocaleString()}
                </td>
              </tr>
            );
          })}
          {projections.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                No projections available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
