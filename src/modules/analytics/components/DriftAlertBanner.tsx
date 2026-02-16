'use client';

import type { DriftAlert } from '../types';

interface Props {
  alerts: DriftAlert[];
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

export default function DriftAlertBanner({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => (
        <div
          key={idx}
          className={`rounded-lg border p-4 ${severityStyles[alert.severity]}`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/10 text-xs font-bold">
              {severityIcons[alert.severity]}
            </span>
            <div>
              <p className="font-medium">{alert.message}</p>
              <p className="mt-1 text-sm opacity-80">{alert.suggestedAction}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
