'use client';

import { Fragment, useEffect, useState } from 'react';

// --- Types -------------------------------------------------------------------

interface ItineraryEntry {
  date: string;
  icon: string;
  description: string;
}

interface Trip {
  id: string;
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  type: 'Business' | 'Personal' | 'Mixed';
  entityName?: string;
  startDate: string;
  endDate: string;
  itinerary: ItineraryEntry[];
  status: string;
  alerts: string;
  budgetUsed: number;
  budgetTotal: number;
  rating?: number;
}

interface UpcomingTripsTabProps {
  entityId?: string;
  onPlanTrip?: () => void;
}

interface PastTripsTabProps {
  entityId?: string;
}

// --- Demo Data ---------------------------------------------------------------

const demoUpcomingTrips: Trip[] = [
  {
    id: 'trip-001',
    origin: 'Las Vegas',
    originCode: 'LAS',
    destination: 'New York City',
    destinationCode: 'JFK',
    type: 'Business',
    entityName: 'MedLink Pro',
    startDate: 'Mar 5, 2026',
    endDate: 'Mar 8, 2026',
    itinerary: [
      { date: 'Mar 5', icon: '\u2708\uFE0F', description: 'LAS \u2192 JFK, Delta DL1234, 6:00am \u2502 Hotel: Marriott' },
      { date: 'Mar 6', icon: '\uD83D\uDCC5', description: 'Meeting: Healthcare Staffing Conf, 9am-5pm' },
      { date: 'Mar 7', icon: '\uD83D\uDCC5', description: 'Client meeting: Dr. Martinez, 10am' },
      { date: 'Mar 8', icon: '\u2708\uFE0F', description: 'JFK \u2192 LAS, Delta DL5678, 4:00pm' },
    ],
    status: '\u2705 All confirmed',
    alerts: 'None',
    budgetUsed: 2340,
    budgetTotal: 3000,
  },
  {
    id: 'trip-002',
    origin: 'Las Vegas',
    originCode: 'LAS',
    destination: 'Miami',
    destinationCode: 'MIA',
    type: 'Personal',
    entityName: undefined,
    startDate: 'Apr 12, 2026',
    endDate: 'Apr 16, 2026',
    itinerary: [
      { date: 'Apr 12', icon: '\u2708\uFE0F', description: 'LAS \u2192 MIA, Spirit NK410, 8:30am \u2502 Hotel: South Beach Inn' },
      { date: 'Apr 13', icon: '\uD83C\uDFD6\uFE0F', description: 'Beach day, South Beach' },
      { date: 'Apr 14', icon: '\uD83C\uDF7D\uFE0F', description: 'Dinner reservation: Zuma, 7:30pm' },
      { date: 'Apr 15', icon: '\uD83D\uDEA4', description: 'Everglades boat tour, 10am' },
      { date: 'Apr 16', icon: '\u2708\uFE0F', description: 'MIA \u2192 LAS, Spirit NK411, 3:00pm' },
    ],
    status: '\u2705 All confirmed',
    alerts: 'None',
    budgetUsed: 1450,
    budgetTotal: 2500,
  },
];

const demoPastTrips: Trip[] = [
  {
    id: 'past-001',
    origin: 'Las Vegas',
    originCode: 'LAS',
    destination: 'San Francisco',
    destinationCode: 'SFO',
    type: 'Business',
    entityName: 'MedLink Pro',
    startDate: 'Jan 10, 2026',
    endDate: 'Jan 12, 2026',
    itinerary: [
      { date: 'Jan 10', icon: '\u2708\uFE0F', description: 'LAS \u2192 SFO, United UA302, 7:00am' },
      { date: 'Jan 11', icon: '\uD83D\uDCC5', description: 'Partner onboarding workshop, 9am-4pm' },
      { date: 'Jan 12', icon: '\u2708\uFE0F', description: 'SFO \u2192 LAS, United UA509, 5:30pm' },
    ],
    status: '\u2705 Completed',
    alerts: 'None',
    budgetUsed: 1820,
    budgetTotal: 2000,
    rating: 4,
  },
  {
    id: 'past-002',
    origin: 'Las Vegas',
    originCode: 'LAS',
    destination: 'Denver',
    destinationCode: 'DEN',
    type: 'Mixed',
    entityName: 'HealthBridge',
    startDate: 'Dec 5, 2025',
    endDate: 'Dec 9, 2025',
    itinerary: [
      { date: 'Dec 5', icon: '\u2708\uFE0F', description: 'LAS \u2192 DEN, Frontier F9220, 9:00am' },
      { date: 'Dec 6', icon: '\uD83D\uDCC5', description: 'HealthBridge quarterly review, 10am-3pm' },
      { date: 'Dec 7', icon: '\u26F7\uFE0F', description: 'Skiing at Breckenridge' },
      { date: 'Dec 8', icon: '\u26F7\uFE0F', description: 'Skiing at Vail' },
      { date: 'Dec 9', icon: '\u2708\uFE0F', description: 'DEN \u2192 LAS, Frontier F9221, 6:00pm' },
    ],
    status: '\u2705 Completed',
    alerts: 'None',
    budgetUsed: 2100,
    budgetTotal: 2200,
    rating: 5,
  },
  {
    id: 'past-003',
    origin: 'Las Vegas',
    originCode: 'LAS',
    destination: 'Chicago',
    destinationCode: 'ORD',
    type: 'Business',
    entityName: 'MedLink Pro',
    startDate: 'Nov 15, 2025',
    endDate: 'Nov 17, 2025',
    itinerary: [
      { date: 'Nov 15', icon: '\u2708\uFE0F', description: 'LAS \u2192 ORD, American AA890, 6:30am' },
      { date: 'Nov 16', icon: '\uD83D\uDCC5', description: 'HIMSS Regional Conference, all day' },
      { date: 'Nov 17', icon: '\u2708\uFE0F', description: 'ORD \u2192 LAS, American AA891, 4:00pm' },
    ],
    status: '\u2705 Completed',
    alerts: 'None',
    budgetUsed: 1560,
    budgetTotal: 1800,
    rating: 3,
  },
];

// --- Helpers -----------------------------------------------------------------

const typeBadgeColors: Record<string, string> = {
  Business: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Personal: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Mixed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function budgetPercentage(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
}

function budgetBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-blue-600';
}

function renderStars(rating: number): string {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);
}

// --- UpcomingTripsTab --------------------------------------------------------

export default function UpcomingTripsTab({ entityId, onPlanTrip }: UpcomingTripsTabProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrips() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ status: 'upcoming' });
        if (entityId) params.set('entityId', entityId);
        const res = await fetch(`/api/travel/trips?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch trips');
        const json = await res.json();
        const tripsData = json.data?.trips ?? json.trips ?? [];
        setTrips(Array.isArray(tripsData) ? tripsData : demoUpcomingTrips);
      } catch {
        setTrips(demoUpcomingTrips);
      } finally {
        setLoading(false);
      }
    }
    fetchTrips();
  }, [entityId]);

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 animate-pulse"
          >
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3" />
            <div className="space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
        <div className="text-5xl mb-4">{'\u2708\uFE0F'}</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No upcoming trips
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          {"You don\u2019t have any trips planned yet. Start planning your next adventure and let your assistant handle the details \u2014 flights, hotels, and itinerary all in one place."}
        </p>
        {onPlanTrip && (
          <button
            onClick={onPlanTrip}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            {'\u2708\uFE0F'} Plan a Trip
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {trips.map((trip) => {
        const pct = budgetPercentage(trip.budgetUsed, trip.budgetTotal);
        return (
          <div
            key={trip.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {'\u2708\uFE0F'} {trip.origin} {'\u2192'} {trip.destination}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColors[trip.type] ?? ''}`}
                  >
                    {trip.type}
                  </span>
                  {trip.entityName && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {trip.entityName}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {trip.startDate} {'\u2013'} {trip.endDate}
              </span>
            </div>

            {/* Itinerary */}
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2">
                {'\u2500\u2500'} Itinerary {'\u2500\u2500'}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {trip.itinerary.map((entry, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">
                      {entry.date}:
                    </span>
                    <span className="shrink-0">{entry.icon}</span>
                    <span>{entry.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status & Budget */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 text-sm">
              <div className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Status:</span> {trip.status} {'\u2502'}{' '}
                <span className="font-medium">Alerts:</span> {trip.alerts}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Budget: ${trip.budgetUsed.toLocaleString()} / ${trip.budgetTotal.toLocaleString()}
                </span>
                {trip.entityName && (
                  <span className="text-gray-500 dark:text-gray-400 text-xs">
                    {'\u2502'} Entity: {trip.entityName}
                  </span>
                )}
              </div>
            </div>

            {/* Budget Progress Bar */}
            <div className="mb-5">
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetBarColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
                {pct}% of budget used
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors">
                {'\uD83D\uDCCB'} Full itinerary
              </button>
              <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors">
                {'\uD83D\uDCC4'} Prep pack
              </button>
              <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors">
                {'\u270F'} Edit
              </button>
              <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors">
                {'\uD83D\uDCE4'} Share
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- PastTripsTab ------------------------------------------------------------

export function PastTripsTab({ entityId }: PastTripsTabProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPastTrips() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ status: 'past' });
        if (entityId) params.set('entityId', entityId);
        const res = await fetch(`/api/travel/trips?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch past trips');
        const json = await res.json();
        const tripsData = json.data?.trips ?? json.trips ?? [];
        setTrips(Array.isArray(tripsData) ? tripsData : demoPastTrips);
      } catch {
        setTrips(demoPastTrips);
      } finally {
        setLoading(false);
      }
    }
    fetchPastTrips();
  }, [entityId]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded w-full mb-2" />
        ))}
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
        <div className="text-5xl mb-4">{'\uD83D\uDDC2\uFE0F'}</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No past trips
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Completed trips will appear here for your records.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
              Destination
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
              Dates
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
              Type
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
              Entity
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
              Budget
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
              Rating
            </th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => {
            const isExpanded = expandedId === trip.id;
            const pct = budgetPercentage(trip.budgetUsed, trip.budgetTotal);
            return (
              <Fragment key={trip.id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : trip.id)}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    {trip.destination}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {trip.startDate} {'\u2013'} {trip.endDate}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColors[trip.type] ?? ''}`}
                    >
                      {trip.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {trip.entityName ?? '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    ${trip.budgetUsed.toLocaleString()} / ${trip.budgetTotal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-yellow-500">
                    {trip.rating ? renderStars(trip.rating) : '\u2014'}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 bg-gray-50 dark:bg-gray-900/30">
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
                          {'\u2500\u2500'} Itinerary {'\u2500\u2500'}
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                          {trip.itinerary.map((entry, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              <span className="font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">
                                {entry.date}:
                              </span>
                              <span className="shrink-0">{entry.icon}</span>
                              <span>{entry.description}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 pt-2 text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            Budget used: {pct}%
                          </span>
                          <div className="flex-1 max-w-xs h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${budgetBarColor(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-gray-500 dark:text-gray-400">
                            ${trip.budgetUsed.toLocaleString()} / ${trip.budgetTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
