'use client';

import type { Itinerary } from '../types';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const legTypeIcons: Record<string, string> = {
  FLIGHT: '✈',
  HOTEL: '🏨',
  CAR_RENTAL: '🚗',
  TRAIN: '🚂',
  TRANSFER: '🚐',
  ACTIVITY: '🎯',
};

export default function ItineraryTimeline({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{itinerary.name}</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[itinerary.status] ?? ''}`}>
          {itinerary.status}
        </span>
      </div>
      <div className="relative">
        {itinerary.legs.map((leg, index) => (
          <div key={leg.id} className="flex gap-4 mb-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm">
                {legTypeIcons[leg.type] ?? leg.order}
              </div>
              {index < itinerary.legs.length - 1 && (
                <div className="w-0.5 h-full bg-blue-200 mt-1" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{leg.departureLocation}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium">{leg.arrivalLocation}</span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {new Date(leg.departureTime).toLocaleDateString()} - {new Date(leg.arrivalTime).toLocaleDateString()}
              </div>
              {leg.provider && (
                <div className="text-sm text-gray-600 mt-1">{leg.provider}</div>
              )}
              <div className="text-sm font-medium text-green-600 mt-1">${leg.costUsd.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t pt-3 flex justify-between text-sm">
        <span className="text-gray-600">Total Cost Estimate</span>
        <span className="font-semibold">${itinerary.totalCostEstimate.toFixed(2)} {itinerary.currency}</span>
      </div>
    </div>
  );
}
