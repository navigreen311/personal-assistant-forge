'use client';

import type { AgingReport } from '@/modules/finance/types';

interface Props {
  report: AgingReport;
}

export default function AgingBar({ report }: Props) {
  const buckets = [
    { label: 'Current (0-30)', data: report.current, color: 'bg-green-500' },
    { label: '31-60 Days', data: report.thirtyDays, color: 'bg-yellow-500' },
    { label: '61-90 Days', data: report.sixtyDays, color: 'bg-orange-500' },
    { label: '90+ Days', data: report.ninetyPlus, color: 'bg-red-500' },
  ];

  const maxAmount = Math.max(...buckets.map((b) => b.data.amount), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Aging Report</h4>
        <span className="text-sm font-medium text-gray-900">
          Total Outstanding: ${report.totalOutstanding.toLocaleString()}
        </span>
      </div>
      <div className="space-y-2">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex items-center gap-3">
            <span className="w-28 text-xs text-gray-600">{bucket.label}</span>
            <div className="flex-1">
              <div className="h-6 w-full rounded bg-gray-100">
                <div
                  className={`h-6 rounded ${bucket.color} flex items-center px-2 text-xs font-medium text-white`}
                  style={{ width: `${Math.max(2, (bucket.data.amount / maxAmount) * 100)}%` }}
                >
                  {bucket.data.count > 0 && `${bucket.data.count}`}
                </div>
              </div>
            </div>
            <span className="w-24 text-right text-sm font-medium">
              ${bucket.data.amount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
