'use client';

import type { Call } from '@/shared/types';
import { OutcomeBadge } from './OutcomeBadge';

export function CallDetailPanel({ call }: { call: Call }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Call Details</h3>
        {call.outcome && <OutcomeBadge outcome={call.outcome} />}
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="font-medium text-gray-500">Direction</dt>
          <dd className="text-gray-900">{call.direction}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Duration</dt>
          <dd className="text-gray-900">
            {call.duration ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}` : 'N/A'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Contact ID</dt>
          <dd className="text-gray-900">{call.contactId ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Sentiment</dt>
          <dd className={
            call.sentiment !== undefined && call.sentiment !== null
              ? call.sentiment > 0.3 ? 'text-green-600' : call.sentiment < -0.3 ? 'text-red-600' : 'text-gray-900'
              : 'text-gray-900'
          }>
            {call.sentiment !== undefined && call.sentiment !== null ? call.sentiment.toFixed(2) : 'N/A'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Persona</dt>
          <dd className="text-gray-900">{call.personaId ?? 'None'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Script</dt>
          <dd className="text-gray-900">{call.scriptId ?? 'None'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Date</dt>
          <dd className="text-gray-900">{new Date(call.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Recording</dt>
          <dd className="text-gray-900">
            {call.recordingUrl ? (
              <a href={call.recordingUrl} className="text-indigo-600 hover:underline">Listen</a>
            ) : 'Not available'}
          </dd>
        </div>
      </dl>

      {call.actionItems.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-500 mb-2">Action Items</h4>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            {call.actionItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
