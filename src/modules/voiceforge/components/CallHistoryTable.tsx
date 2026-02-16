'use client';

import type { Call } from '@/shared/types';
import { OutcomeBadge } from './OutcomeBadge';

interface CallHistoryTableProps {
  calls: Call[];
  onSelectCall?: (callId: string) => void;
}

export function CallHistoryTable({ calls, onSelectCall }: CallHistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outcome</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sentiment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {calls.map((call) => (
            <tr
              key={call.id}
              onClick={() => onSelectCall?.(call.id)}
              className="hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                {new Date(call.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                <span className={call.direction === 'INBOUND' ? 'text-blue-600' : 'text-purple-600'}>
                  {call.direction}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                {call.contactId ?? 'Unknown'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                {call.duration ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}` : '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {call.outcome ? <OutcomeBadge outcome={call.outcome} /> : '-'}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap">
                {call.sentiment !== undefined && call.sentiment !== null ? (
                  <span className={call.sentiment > 0.3 ? 'text-green-600' : call.sentiment < -0.3 ? 'text-red-600' : 'text-gray-600'}>
                    {call.sentiment.toFixed(2)}
                  </span>
                ) : '-'}
              </td>
            </tr>
          ))}
          {calls.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                No calls found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
