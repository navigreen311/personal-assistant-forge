'use client';

import type { FlightAlert, DisruptionResponse } from '../types';

const severityStyles: Record<string, string> = {
  INFO: 'bg-blue-50 border-blue-200 text-blue-800',
  WARNING: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  CRITICAL: 'bg-red-50 border-red-200 text-red-800',
};

export default function FlightAlertBanner({
  alert,
  alternatives,
}: {
  alert: FlightAlert;
  alternatives?: DisruptionResponse;
}) {
  return (
    <div className={`border rounded-lg p-4 ${severityStyles[alert.severity] ?? ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{alert.severity === 'CRITICAL' ? '🚨' : alert.severity === 'WARNING' ? '⚠️' : 'ℹ️'}</span>
        <div className="flex-1">
          <div className="font-semibold">{alert.alertType.replace('_', ' ')}</div>
          <div className="text-sm mt-1">{alert.message}</div>
        </div>
      </div>
      {alert.originalValue && alert.newValue && (
        <div className="mt-2 text-sm">
          <span className="line-through opacity-60">{alert.originalValue}</span>
          <span className="mx-2">→</span>
          <span className="font-medium">{alert.newValue}</span>
        </div>
      )}
      {alternatives && (
        <div className="mt-3 border-t pt-3">
          <div className="text-sm font-medium mb-2">Alternative Options:</div>
          {alternatives.alternatives.map((alt, idx) => (
            <div key={alt.id} className="flex justify-between items-center py-1 text-sm">
              <span>{alt.provider} - {new Date(alt.departureTime).toLocaleTimeString()}</span>
              <span className="font-medium">${alt.costUsd.toFixed(2)}</span>
            </div>
          ))}
          <div className="mt-2 text-sm">
            <span className="font-medium">Recommendation: </span>{alternatives.reason}
            <span className="ml-2 font-medium">
              (Additional cost: ${alternatives.additionalCost.toFixed(2)})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
