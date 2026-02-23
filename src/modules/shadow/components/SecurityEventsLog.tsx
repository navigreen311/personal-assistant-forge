'use client';

import { useState, useEffect, useCallback } from 'react';

type EventStatus = 'Success' | 'Verified' | 'PIN required' | 'Refused';

interface SecurityEvent {
  id: string;
  date: string;
  event: string;
  status: EventStatus;
}

interface SecurityEventsLogProps {
  userId?: string;
}

const STATUS_STYLES: Record<EventStatus, string> = {
  Success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Verified: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'PIN required': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Refused: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_ICONS: Record<EventStatus, JSX.Element> = {
  Success: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  Verified: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  'PIN required': (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Refused: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
};

export default function SecurityEventsLog({ userId }: SecurityEventsLogProps) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const res = await fetch(`/api/shadow/security-events${params}`);
      if (!res.ok) throw new Error('Failed to load security events');
      const data = await res.json();
      const list: SecurityEvent[] = data.events ?? data ?? [];
      setEvents(list.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security events');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
        Recent Security Events
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        The last 5 security-related events for your account.
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
          Loading events...
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">{error}</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
          No recent security events.
        </p>
      )}

      {!loading && events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Event
                </th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {events.map((evt) => (
                <tr key={evt.id}>
                  <td className="py-2.5 pr-4 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(evt.date)}
                  </td>
                  <td className="py-2.5 pr-4 text-sm text-gray-900 dark:text-white">
                    {evt.event}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[evt.status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
                    >
                      {STATUS_ICONS[evt.status] ?? null}
                      {evt.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <a
          href="/trust"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          View full security log
        </a>
      </div>
    </div>
  );
}
