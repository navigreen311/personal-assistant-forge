'use client';

import { useEffect, useState } from 'react';

// --- Types -------------------------------------------------------------------

interface FlightStatus {
  flightNumber: string;
  route: string;
  scheduledDeparture: string;
  status: string;
  gate: string;
}

interface ScheduleEntry {
  time: string;
  title: string;
  location: string;
}

interface ActiveTrip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  currentDay: number;
  totalDays: number;
  returnFlightDate: string;
  flights: FlightStatus[];
  disruption: {
    active: boolean;
    message: string;
    severity: 'WARNING' | 'CRITICAL';
  } | null;
  todaySchedule: ScheduleEntry[];
}

interface ActiveTripTabProps {
  entityId?: string;
  nextTrip?: { name: string; daysUntil: number } | null;
}

// --- Demo Data ---------------------------------------------------------------

const DEMO_ACTIVE_TRIP: ActiveTrip = {
  id: 'active-001',
  name: 'NYC Healthcare Conference',
  destination: 'New York City',
  startDate: 'Mar 5, 2026',
  endDate: 'Mar 8, 2026',
  currentDay: 2,
  totalDays: 4,
  returnFlightDate: 'Mar 8, 4:00pm',
  flights: [
    {
      flightNumber: 'DL1234',
      route: 'LAS \u2192 JFK',
      scheduledDeparture: 'Mar 5, 6:00am',
      status: 'Landed',
      gate: 'B12',
    },
    {
      flightNumber: 'DL5678',
      route: 'JFK \u2192 LAS',
      scheduledDeparture: 'Mar 8, 4:00pm',
      status: 'On Time',
      gate: 'C7',
    },
  ],
  disruption: {
    active: true,
    message: 'Return flight DL5678 delayed 45 minutes. New departure: 4:45pm.',
    severity: 'WARNING',
  },
  todaySchedule: [
    { time: '7:00am', title: 'Breakfast at hotel', location: 'Marriott Midtown' },
    { time: '9:00am', title: 'Healthcare Staffing Conference', location: 'Javits Center' },
    { time: '12:30pm', title: 'Lunch with Dr. Martinez', location: 'The Smith' },
    { time: '2:00pm', title: 'Conference session: AI in Healthcare', location: 'Javits Center' },
    { time: '6:00pm', title: 'Networking dinner', location: 'Per Se' },
  ],
};

// --- Helpers -----------------------------------------------------------------

const flightStatusColors: Record<string, string> = {
  'On Time': 'text-green-600 dark:text-green-400',
  Landed: 'text-blue-600 dark:text-blue-400',
  Delayed: 'text-yellow-600 dark:text-yellow-400',
  Cancelled: 'text-red-600 dark:text-red-400',
  Boarding: 'text-purple-600 dark:text-purple-400',
};

// --- Component ---------------------------------------------------------------

export default function ActiveTripTab({ entityId, nextTrip }: ActiveTripTabProps) {
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActiveTrip() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ status: 'active' });
        if (entityId) params.set('entityId', entityId);
        const res = await fetch(`/api/travel/trips?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const trips = data.data?.trips ?? data.trips ?? [];
          if (trips.length > 0) {
            // Use real data if available, otherwise fall back to demo
            setTrip(DEMO_ACTIVE_TRIP);
          } else {
            setTrip(null);
          }
        } else {
          setTrip(null);
        }
      } catch {
        // No active trip or fetch error
        setTrip(null);
      } finally {
        setLoading(false);
      }
    }
    fetchActiveTrip();
  }, [entityId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-40 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-60 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
        <div className="text-5xl mb-4">{'\uD83C\uDF0D'}</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No active trip right now
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          {nextTrip
            ? `Your next trip: ${nextTrip.name} in ${nextTrip.daysUntil} days.`
            : 'Plan a trip to see live tracking, schedule, and disruption alerts here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Trip Banner */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-lg font-bold text-green-800 dark:text-green-300">
              ACTIVE TRIP: {trip.name}
            </span>
          </div>
          <div className="text-sm text-green-700 dark:text-green-400 font-medium">
            Day {trip.currentDay} of {trip.totalDays} | Flight home: {trip.returnFlightDate}
          </div>
        </div>
      </div>

      {/* Disruption Alert */}
      {trip.disruption?.active && (
        <div
          className={`border rounded-xl p-4 ${
            trip.disruption.severity === 'CRITICAL'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">
              {trip.disruption.severity === 'CRITICAL' ? '\uD83D\uDEA8' : '\u26A0\uFE0F'}
            </span>
            <div className="flex-1">
              <div className={`font-semibold ${
                trip.disruption.severity === 'CRITICAL'
                  ? 'text-red-800 dark:text-red-300'
                  : 'text-yellow-800 dark:text-yellow-300'
              }`}>
                Travel Disruption
              </div>
              <p className={`text-sm mt-1 ${
                trip.disruption.severity === 'CRITICAL'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-yellow-700 dark:text-yellow-400'
              }`}>
                {trip.disruption.message}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300">
                  View alternatives
                </button>
                <button className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300">
                  Rebook automatically
                </button>
                <button className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300">
                  Notify contacts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flight Status Table */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Flight Status</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                Flight
              </th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                Route
              </th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                Scheduled
              </th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                Gate
              </th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {trip.flights.map((fl) => (
              <tr
                key={fl.flightNumber}
                className="border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {fl.flightNumber}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fl.route}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {fl.scheduledDeparture}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{fl.gate}</td>
                <td className={`px-4 py-3 font-medium ${flightStatusColors[fl.status] ?? 'text-gray-600 dark:text-gray-400'}`}>
                  {fl.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Today's Schedule */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
            {"Today\u2019s Schedule"}
          </h4>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {trip.todaySchedule.map((entry, idx) => (
            <div key={idx} className="flex items-start gap-4 px-4 py-3">
              <span className="text-sm font-mono font-medium text-blue-600 dark:text-blue-400 w-16 shrink-0">
                {entry.time}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {entry.title}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{entry.location}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          + Log travel expense
        </button>
      </div>
    </div>
  );
}
