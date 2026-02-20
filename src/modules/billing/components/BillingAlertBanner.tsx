'use client';

import { useState } from 'react';
import type { BillingAlert, BillingAlertSeverity } from '@/modules/billing/types';

// --- Props ---

interface BillingAlertBannerProps {
  alerts: BillingAlert[];
}

// --- Severity styles ---

const severityStyles: Record<BillingAlertSeverity, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  critical: 'bg-red-50 border-red-200 text-red-800',
};

const severityIcons: Record<BillingAlertSeverity, string> = {
  info: 'i',
  warning: '!',
  critical: '!!',
};

const severityIconBg: Record<BillingAlertSeverity, string> = {
  info: 'bg-blue-200 text-blue-800',
  warning: 'bg-yellow-200 text-yellow-800',
  critical: 'bg-red-200 text-red-800',
};

// --- Component ---

export default function BillingAlertBanner({ alerts }: BillingAlertBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  if (alerts.length === 0) return null;

  const visibleAlerts = alerts.filter(
    (a) => !(a.dismissible !== false && dismissedIds.has(a.id))
  );

  if (visibleAlerts.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className="space-y-2">
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center gap-3 rounded-lg border p-3 shadow-sm ${severityStyles[alert.severity]}`}
          role="alert"
        >
          <span
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${severityIconBg[alert.severity]}`}
          >
            {severityIcons[alert.severity]}
          </span>
          <span className="text-sm font-medium flex-1">{alert.message}</span>
          {alert.actionLabel && alert.actionUrl && (
            <a
              href={alert.actionUrl}
              className="text-xs font-medium underline hover:no-underline flex-shrink-0"
            >
              {alert.actionLabel}
            </a>
          )}
          {alert.dismissible !== false && (
            <button
              className="text-xs opacity-60 hover:opacity-100 flex-shrink-0 ml-2"
              onClick={() => handleDismiss(alert.id)}
              aria-label="Dismiss alert"
            >
              &#10005;
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
