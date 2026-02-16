'use client';

import { useState } from 'react';
import type { Call } from '@/shared/types';
import { CallHistoryTable } from '@/modules/voiceforge/components/CallHistoryTable';
import { CallDetailPanel } from '@/modules/voiceforge/components/CallDetailPanel';

export default function CallsPage() {
  const [calls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');

  const filteredCalls = calls.filter((call) => {
    if (directionFilter !== 'ALL' && call.direction !== directionFilter) return false;
    if (outcomeFilter !== 'ALL' && call.outcome !== outcomeFilter) return false;
    return true;
  });

  const handleSelectCall = async (callId: string) => {
    try {
      const res = await fetch(`/api/voice/calls/${callId}`);
      const data = await res.json();
      if (data.success) setSelectedCall(data.data);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Call Management</h1>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md"
        >
          <option value="ALL">All Directions</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
        </select>
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md"
        >
          <option value="ALL">All Outcomes</option>
          <option value="CONNECTED">Connected</option>
          <option value="VOICEMAIL">Voicemail</option>
          <option value="NO_ANSWER">No Answer</option>
          <option value="BUSY">Busy</option>
          <option value="INTERESTED">Interested</option>
          <option value="NOT_INTERESTED">Not Interested</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Call Table */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white">
            <CallHistoryTable calls={filteredCalls} onSelectCall={handleSelectCall} />
          </div>
        </div>

        {/* Detail Panel */}
        <div>
          {selectedCall ? (
            <CallDetailPanel call={selectedCall} />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              Select a call to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
