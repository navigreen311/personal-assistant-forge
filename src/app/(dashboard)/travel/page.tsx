'use client';

import { useState, useEffect } from 'react';
import UpcomingTripsTab, { PastTripsTab } from '@/modules/travel/components/UpcomingTripsTab';
import ActiveTripTab from '@/modules/travel/components/ActiveTripTab';
import TravelPreferencesTab from '@/modules/travel/components/TravelPreferencesTab';
import TravelLoyaltyTab from '@/modules/travel/components/TravelLoyaltyTab';
import TripWizard from '@/modules/travel/components/TripWizard';

// --- Types -------------------------------------------------------------------

interface TravelStats {
  upcoming: number;
  active: number;
  thisYear: number;
  loyaltyBalance: number;
}

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'loyalty', label: 'Loyalty' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// --- Component ---------------------------------------------------------------

export default function TravelDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('upcoming');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stats, setStats] = useState<TravelStats>({
    upcoming: 0,
    active: 0,
    thisYear: 0,
    loyaltyBalance: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/travel/trips?status=all');
        if (res.ok) {
          const json = await res.json();
          const s = json.data?.stats ?? json.stats;
          if (s) {
            setStats({
              upcoming: s.upcoming ?? 0,
              active: s.active ?? 0,
              thisYear: s.thisYear ?? 0,
              loyaltyBalance: s.loyaltyBalance ?? 0,
            });
          }
        }
      } catch {
        // Keep defaults
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Travel &amp; Logistics
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Plan trips, track flights, manage bookings, and monitor travel disruptions.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shrink-0"
        >
          + Plan New Trip
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Upcoming Trips"
          value={loading ? '...' : String(stats.upcoming)}
          loading={loading}
        />
        <StatCard
          label="Active Trip"
          value={loading ? '...' : stats.active > 0 ? `${stats.active} active` : 'None'}
          loading={loading}
        />
        <StatCard
          label="This Year"
          value={loading ? '...' : String(stats.thisYear)}
          loading={loading}
        />
        <StatCard
          label="Miles/Pts Balance"
          value={loading ? '...' : stats.loyaltyBalance.toLocaleString()}
          loading={loading}
        />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Travel tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'upcoming' && (
          <UpcomingTripsTab onPlanTrip={() => setWizardOpen(true)} />
        )}
        {activeTab === 'active' && <ActiveTripTab />}
        {activeTab === 'past' && <PastTripsTab />}
        {activeTab === 'preferences' && <TravelPreferencesTab />}
        {activeTab === 'loyalty' && <TravelLoyaltyTab />}
      </div>

      {/* Trip Wizard Modal */}
      <TripWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
    </div>
  );
}

// --- Sub-components ----------------------------------------------------------

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      {loading ? (
        <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded mt-1 animate-pulse" />
      ) : (
        <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</div>
      )}
    </div>
  );
}
