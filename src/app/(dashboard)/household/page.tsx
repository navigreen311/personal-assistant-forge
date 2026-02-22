'use client';

import { useState, useEffect } from 'react';
import MaintenanceCalendar from '@/modules/household/components/MaintenanceCalendar';
import MaintenanceTaskCard from '@/modules/household/components/MaintenanceTaskCard';
import ShoppingList from '@/modules/household/components/ShoppingList';
import WarrantyTracker from '@/modules/household/components/WarrantyTracker';
import SubscriptionManager from '@/modules/household/components/SubscriptionManager';
import VehicleDashboard from '@/modules/household/components/VehicleDashboard';
import type { MaintenanceTask, ShoppingItem, WarrantyRecord, SubscriptionRecord, VehicleRecord } from '@/modules/household/types';

export default function HouseholdDashboard() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        if (tasksRes.ok) { const j = await tasksRes.json(); setTasks(j.data ?? []); }
        if (shoppingRes.ok) { const j = await shoppingRes.json(); setShopping(j.data ?? []); }
        if (warrantiesRes.ok) { const j = await warrantiesRes.json(); setWarranties(j.data ?? []); }
        if (subsRes.ok) { const j = await subsRes.json(); setSubscriptions(j.data ?? []); }
        if (vehiclesRes.ok) { const j = await vehiclesRes.json(); setVehicles(j.data ?? []); }
      } catch (err) {
        console.error('Failed to fetch household data:', err);
        setError('Failed to load household data. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Household Management</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          <span className="ml-3 text-gray-600">Loading household data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Household Management</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Household Management</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <MaintenanceCalendar tasks={tasks} />
      </div>

      {tasks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tasks.map(task => (
            <MaintenanceTaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No maintenance tasks scheduled.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <ShoppingList items={shopping} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <SubscriptionManager subscriptions={subscriptions} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <WarrantyTracker warranties={warranties} />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <VehicleDashboard vehicles={vehicles} />
      </div>
    </div>
  );
}
