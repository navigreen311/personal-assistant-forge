'use client';

import type { FinancialAlert } from '@/modules/finance/types';

interface Props {
  alerts: FinancialAlert[];
}

const severityStyles = {
  INFO: 'bg-blue-50 border-blue-200 text-blue-800',
  WARNING: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  CRITICAL: 'bg-red-50 border-red-200 text-red-800',
};

const severityIcons = {
  INFO: 'i',
  WARNING: '!',
  CRITICAL: '!!',
};

export default function AlertBanner({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center gap-3 rounded-lg border p-3 ${severityStyles[alert.severity]}`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-current/10 text-xs font-bold">
            {severityIcons[alert.severity]}
          </span>
          <span className="text-sm font-medium">{alert.message}</span>
          <span className="ml-auto text-xs opacity-70">{alert.type.replace(/_/g, ' ')}</span>
        </div>
      ))}
    </div>
  );
}
