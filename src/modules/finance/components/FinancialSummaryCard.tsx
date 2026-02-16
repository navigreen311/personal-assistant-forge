'use client';

import type { FinancialSummary } from '@/modules/finance/types';

interface Props {
  summary: FinancialSummary;
}

export default function FinancialSummaryCard({ summary }: Props) {
  const isPositive = summary.netCashFlow >= 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{summary.entityName}</h3>
        <span className="text-sm text-gray-500">{summary.currency}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">Income</p>
          <p className="text-xl font-bold text-green-600">
            ${summary.totalIncome.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Expenses</p>
          <p className="text-xl font-bold text-red-600">
            ${summary.totalExpenses.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-500">Net Cash Flow</p>
        <p className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}${summary.netCashFlow.toLocaleString()}
        </p>
      </div>

      <div className="mt-4 flex gap-4 text-sm">
        {summary.pendingInvoices > 0 && (
          <span className="rounded bg-yellow-100 px-2 py-1 text-yellow-800">
            {summary.pendingInvoices} pending invoices (${summary.pendingInvoiceAmount.toLocaleString()})
          </span>
        )}
        {summary.overdueBills > 0 && (
          <span className="rounded bg-red-100 px-2 py-1 text-red-800">
            {summary.overdueBills} overdue (${summary.overdueBillAmount.toLocaleString()})
          </span>
        )}
      </div>
    </div>
  );
}
