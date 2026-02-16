'use client';

import type { ConsentChainEntry } from '@/modules/voiceforge/types';

const STATUS_STYLES: Record<string, string> = {
  GRANTED: 'bg-green-500',
  REVOKED: 'bg-red-500',
  EXPIRED: 'bg-yellow-500',
  PENDING: 'bg-gray-400',
};

export function ConsentChainTimeline({ entries }: { entries: ConsentChainEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">No consent entries</p>;
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full ${STATUS_STYLES[entry.status] ?? 'bg-gray-400'}`} />
            {i < entries.length - 1 && <div className="w-0.5 flex-1 bg-gray-200" />}
          </div>

          {/* Content */}
          <div className="pb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{entry.status}</span>
              <span className="text-xs text-gray-400">
                {new Date(entry.grantedAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-xs text-gray-600">
              Granted by: {entry.grantedBy}
            </p>
            <p className="text-xs text-gray-500">
              Scope: {entry.scope}
            </p>
            {entry.watermarkId && (
              <p className="text-xs text-gray-400">
                Watermark: {entry.watermarkId}
              </p>
            )}
            {entry.revokedAt && (
              <p className="text-xs text-red-500">
                Revoked: {new Date(entry.revokedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
