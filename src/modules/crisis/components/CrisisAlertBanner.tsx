'use client';

import type { CrisisEvent } from '../types';

const severityColors: Record<string, string> = {
  LOW: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  MEDIUM: 'bg-orange-50 border-orange-300 text-orange-800',
  HIGH: 'bg-red-50 border-red-300 text-red-800',
  CRITICAL: 'bg-red-100 border-red-500 text-red-900',
};

export default function CrisisAlertBanner({ crisis }: { crisis: CrisisEvent }) {
  return (
    <div className={`w-full border-l-4 rounded-r-lg p-4 ${severityColors[crisis.severity] ?? ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{crisis.severity === 'CRITICAL' ? '🚨' : '⚠️'}</span>
          <div>
            <div className="font-bold text-lg">{crisis.title}</div>
            <div className="text-sm opacity-75">
              {crisis.type.replace('_', ' ')} | Detected: {new Date(crisis.detectedAt).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-white bg-opacity-50">
            {crisis.status}
          </span>
          {crisis.status === 'DETECTED' && (
            <button className="px-4 py-2 bg-white rounded-md text-sm font-medium hover:bg-opacity-90 shadow-sm">
              Acknowledge
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm">{crisis.description}</p>
    </div>
  );
}
