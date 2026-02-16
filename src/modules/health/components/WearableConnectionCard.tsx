'use client';

import type { WearableConnection } from '../types';

const providerLogos: Record<string, string> = {
  APPLE_WATCH: '\u231A',
  FITBIT: '\uD83D\uDCF1',
  OURA: '\uD83D\uDC8D',
  WHOOP: '\uD83D\uDD17',
  GARMIN: '\u231A',
};

export default function WearableConnectionCard({ connection }: { connection: WearableConnection }) {
  return (
    <div className={`border rounded-lg p-4 ${connection.isConnected ? 'border-green-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{providerLogos[connection.provider] ?? '\uD83D\uDCF1'}</span>
          <div>
            <div className="font-medium">{connection.provider.replace('_', ' ')}</div>
            <div className="text-xs text-gray-500">
              {connection.lastSyncAt
                ? `Last synced: ${new Date(connection.lastSyncAt).toLocaleString()}`
                : 'Never synced'}
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-sm ${connection.isConnected ? 'text-green-600' : 'text-gray-400'}`}>
          <div className={`w-2 h-2 rounded-full ${connection.isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
          {connection.isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
}
