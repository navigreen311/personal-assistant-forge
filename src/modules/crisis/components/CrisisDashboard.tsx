'use client';

import type { CrisisEvent } from '../types';

const severityColors: Record<string, string> = {
  LOW: 'border-yellow-300 bg-yellow-50',
  MEDIUM: 'border-orange-300 bg-orange-50',
  HIGH: 'border-red-300 bg-red-50',
  CRITICAL: 'border-red-500 bg-red-100',
};

const statusBadge: Record<string, string> = {
  DETECTED: 'bg-red-100 text-red-800',
  ACKNOWLEDGED: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  MITIGATED: 'bg-green-100 text-green-800',
  RESOLVED: 'bg-gray-100 text-gray-800',
  POST_MORTEM: 'bg-purple-100 text-purple-800',
};

export default function CrisisDashboard({ crises }: { crises: CrisisEvent[] }) {
  const active = crises.filter(c => c.status !== 'RESOLVED' && c.status !== 'POST_MORTEM');
  const resolved = crises.filter(c => c.status === 'RESOLVED' || c.status === 'POST_MORTEM');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Crisis Dashboard</h3>
        {active.length > 0 && (
          <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
            {active.length} Active
          </span>
        )}
      </div>

      {active.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-3xl mb-2">✓</div>
          <div>No active crises</div>
        </div>
      )}

      <div className="space-y-3">
        {active.map(crisis => (
          <div key={crisis.id} className={`border-l-4 rounded-r-lg p-4 ${severityColors[crisis.severity] ?? ''}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{crisis.title}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {crisis.type.replace('_', ' ')} | {new Date(crisis.detectedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge[crisis.status] ?? ''}`}>
                  {crisis.status}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-white border">
                  {crisis.severity}
                </span>
              </div>
            </div>
            {crisis.warRoom.isActive && (
              <div className="mt-2 text-xs text-red-700 font-medium flex items-center gap-1">
                🚨 War Room Active
              </div>
            )}
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Resolved ({resolved.length})</h4>
          <div className="space-y-2">
            {resolved.map(crisis => (
              <div key={crisis.id} className="border rounded-lg p-3 opacity-60">
                <div className="flex justify-between items-center">
                  <span className="text-sm">{crisis.title}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${statusBadge[crisis.status] ?? ''}`}>
                    {crisis.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
