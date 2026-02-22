'use client';

import { useState, useEffect, useMemo } from 'react';
import MaintenanceCalendar from '@/modules/household/components/MaintenanceCalendar';
import MaintenanceTaskCard from '@/modules/household/components/MaintenanceTaskCard';
import ShoppingList from '@/modules/household/components/ShoppingList';
import WarrantyTracker from '@/modules/household/components/WarrantyTracker';
import SubscriptionManager from '@/modules/household/components/SubscriptionManager';
import VehicleDashboard from '@/modules/household/components/VehicleDashboard';
import type {
  MaintenanceTask,
  ShoppingItem,
  WarrantyRecord,
  SubscriptionRecord,
  VehicleRecord,
} from '@/modules/household/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Tab = 'calendar' | 'tasks' | 'providers' | 'properties' | 'inventory';

const TABS: { key: Tab; label: string }[] = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'providers', label: 'Providers' },
  { key: 'properties', label: 'Properties' },
  { key: 'inventory', label: 'Inventory' },
];

const MOCK_PROPERTIES = ['All Properties', '123 Main Street', '456 Rental Ave'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HouseholdDashboard() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [selectedProperty, setSelectedProperty] = useState('All Properties');

  // -- Data fetching --------------------------------------------------------

  useEffect(() => {
    async function fetchData() {
      try {
        const [tasksRes, shoppingRes, warrantiesRes, subsRes, vehiclesRes] = await Promise.all([
          fetch('/api/household/maintenance'),
          fetch('/api/household/shopping'),
          fetch('/api/household/warranties'),
          fetch('/api/household/subscriptions'),
          fetch('/api/household/vehicles'),
        ]);

        if (tasksRes.ok) {
          const j = await tasksRes.json();
          setTasks(j.data ?? []);
        }
        if (shoppingRes.ok) {
          const j = await shoppingRes.json();
          setShopping(j.data ?? []);
        }
        if (warrantiesRes.ok) {
          const j = await warrantiesRes.json();
          setWarranties(j.data ?? []);
        }
        if (subsRes.ok) {
          const j = await subsRes.json();
          setSubscriptions(j.data ?? []);
        }
        if (vehiclesRes.ok) {
          const j = await vehiclesRes.json();
          setVehicles(j.data ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch household data:', err);
        setError('Failed to load household data. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // -- Stats computation ----------------------------------------------------

  const stats = useMemo(() => {
    const now = new Date();

    const upcomingCount = tasks.filter((t) => t.status === 'UPCOMING').length;
    const overdueCount = tasks.filter((t) => t.status === 'OVERDUE').length;

    const monthlyHomeCost = tasks.reduce((sum, t) => {
      if (t.estimatedCostUsd && t.status !== 'COMPLETED' && t.status !== 'SKIPPED') {
        // Normalize to monthly based on frequency
        switch (t.frequency) {
          case 'MONTHLY':
            return sum + t.estimatedCostUsd;
          case 'QUARTERLY':
            return sum + t.estimatedCostUsd / 3;
          case 'BIANNUAL':
            return sum + t.estimatedCostUsd / 6;
          case 'ANNUAL':
            return sum + t.estimatedCostUsd / 12;
          case 'ONE_TIME':
            return sum + t.estimatedCostUsd;
          default:
            return sum + t.estimatedCostUsd;
        }
      }
      return sum;
    }, 0);

    const propertyCount = MOCK_PROPERTIES.length - 1; // exclude "All Properties"

    return { propertyCount, upcomingCount, overdueCount, monthlyHomeCost };
  }, [tasks]);

  // -- Loading / Error states -----------------------------------------------

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
          Household Management
        </h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading household data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
          Household Management
        </h1>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  // -- Render ---------------------------------------------------------------

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Household Management
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track maintenance, manage providers, and keep your properties in top shape.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Property filter dropdown */}
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          >
            {MOCK_PROPERTIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Add Property button */}
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <span className="text-lg leading-none">+</span> Add Property
          </button>

          {/* Add Task button */}
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <span className="text-lg leading-none">+</span> Add Task
          </button>
        </div>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Properties</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {stats.propertyCount}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Upcoming Tasks</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {stats.upcomingCount}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Overdue Tasks</span>
            {stats.overdueCount > 0 && (
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </div>
          <div
            className={`mt-1 text-2xl font-bold ${
              stats.overdueCount > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {stats.overdueCount}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly Home Cost</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            ${stats.monthlyHomeCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6" aria-label="Household tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <MaintenanceCalendar tasks={tasks} />
          </div>

          {/* Task cards below calendar */}
          {tasks.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                All Tasks
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tasks.map((task) => (
                  <MaintenanceTaskCard key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Auxiliary sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <ShoppingList items={shopping} />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <SubscriptionManager subscriptions={subscriptions} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <WarrantyTracker warranties={warranties} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <VehicleDashboard vehicles={vehicles} />
          </div>
        </div>
      )}

      {/* Tasks Tab — placeholder for Worker 2/3 */}
      {activeTab === 'tasks' && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Coming soon</div>
      )}

      {/* Providers Tab — placeholder for Worker 2/3 */}
      {activeTab === 'providers' && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Coming soon</div>
      )}

      {/* Properties Tab — placeholder for Worker 2/3 */}
      {activeTab === 'properties' && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Coming soon</div>
      )}

      {/* Inventory Tab — placeholder for Worker 2/3 */}
      {activeTab === 'inventory' && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Coming soon</div>
      )}
    </div>
  );
}
