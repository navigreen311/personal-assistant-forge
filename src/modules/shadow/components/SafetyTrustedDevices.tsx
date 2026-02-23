'use client';

import { useState, useEffect, useCallback } from 'react';

interface TrustedDevice {
  id: string;
  name: string;
  type: 'Web browser' | 'Phone';
  verifiedDate: string;
  lastActiveDate: string;
}

interface SafetyTrustedDevicesProps {
  userId?: string;
}

export default function SafetyTrustedDevices({ userId }: SafetyTrustedDevicesProps) {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const res = await fetch(`/api/shadow/config/trusted-devices${params}`);
      if (!res.ok) throw new Error('Failed to load trusted devices');
      const data = await res.json();
      setDevices(data.devices ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trusted devices');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRemove = async (deviceId: string) => {
    setRemovingId(deviceId);
    try {
      const res = await fetch(`/api/shadow/config/trusted-devices/${deviceId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove device');
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device');
    } finally {
      setRemovingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Trusted Devices</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Unknown callers must verify with an SMS code before Shadow will execute any actions.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading devices...
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">{error}</p>
      )}

      {!loading && !error && devices.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
          No trusted devices registered.
        </p>
      )}

      {!loading && devices.length > 0 && (
        <div className="space-y-3 mb-4">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
            >
              <div className="flex items-start gap-3">
                {/* Device type icon */}
                {device.type === 'Phone' ? (
                  <svg
                    className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{device.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {device.type} &middot; Verified {formatDate(device.verifiedDate)} &middot; Last
                    active {formatDate(device.lastActiveDate)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(device.id)}
                disabled={removingId === device.id}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 ml-3"
              >
                {removingId === device.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add trusted device
      </button>
    </div>
  );
}
