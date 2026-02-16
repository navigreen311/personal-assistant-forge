'use client';

import type { ItineraryLeg } from '../types';

const statusColors: Record<string, string> = {
  BOOKED: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  CANCELLED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
};

export default function LegCard({ leg }: { leg: ItineraryLeg }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-gray-500 uppercase">{leg.type.replace('_', ' ')}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-semibold">{leg.departureLocation}</span>
            <span className="text-gray-400">→</span>
            <span className="font-semibold">{leg.arrivalLocation}</span>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[leg.status] ?? ''}`}>
          {leg.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-gray-500">Departure</div>
          <div>{new Date(leg.departureTime).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Arrival</div>
          <div>{new Date(leg.arrivalTime).toLocaleString()}</div>
        </div>
      </div>
      {leg.provider && (
        <div className="mt-2 text-sm text-gray-600">Provider: {leg.provider}</div>
      )}
      {leg.confirmationNumber && (
        <div className="mt-1 text-sm text-gray-600">Confirmation: {leg.confirmationNumber}</div>
      )}
      <div className="mt-2 text-right font-semibold text-green-600">${leg.costUsd.toFixed(2)}</div>
    </div>
  );
}
