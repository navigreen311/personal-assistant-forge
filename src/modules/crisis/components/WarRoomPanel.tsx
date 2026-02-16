'use client';

import type { WarRoomState } from '../types';

export default function WarRoomPanel({ state }: { state: WarRoomState }) {
  if (!state.isActive) {
    return (
      <div className="border rounded-lg p-6 text-center text-gray-500">
        <div className="text-2xl mb-2">🏠</div>
        <div className="font-medium">War Room Inactive</div>
        <div className="text-sm">Activate war room to clear calendar and surface relevant documents.</div>
      </div>
    );
  }

  return (
    <div className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🚨</span>
        <h3 className="text-lg font-bold text-red-800">War Room Active</h3>
        {state.activatedAt && (
          <span className="text-xs text-red-600 ml-auto">Since: {new Date(state.activatedAt).toLocaleString()}</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold text-red-700 mb-2">Cleared Events ({state.clearedCalendarEvents.length})</h4>
          <ul className="space-y-1">
            {state.clearedCalendarEvents.map((evt, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-center gap-1">
                <span className="text-gray-400">✕</span> {evt}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-red-700 mb-2">Surfaced Documents ({state.surfacedDocuments.length})</h4>
          <ul className="space-y-1">
            {state.surfacedDocuments.map((doc, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-center gap-1">
                <span className="text-blue-500">📄</span> {doc}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-red-700 mb-2">Drafted Communications ({state.draftedComms.length})</h4>
          <ul className="space-y-1">
            {state.draftedComms.map((comm, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-center gap-1">
                <span className="text-gray-400">✉</span> {comm}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-red-700 mb-2">Participants ({state.participants.length})</h4>
          <div className="flex flex-wrap gap-1">
            {state.participants.map((p, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-white rounded-full text-xs text-gray-700 border">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
