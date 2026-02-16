'use client';

import MaintenanceCalendar from '@/modules/household/components/MaintenanceCalendar';
import MaintenanceTaskCard from '@/modules/household/components/MaintenanceTaskCard';
import ShoppingList from '@/modules/household/components/ShoppingList';
import WarrantyTracker from '@/modules/household/components/WarrantyTracker';
import SubscriptionManager from '@/modules/household/components/SubscriptionManager';
import VehicleDashboard from '@/modules/household/components/VehicleDashboard';
import type { MaintenanceTask, ShoppingItem, WarrantyRecord, SubscriptionRecord, VehicleRecord } from '@/modules/household/types';

const sampleTasks: MaintenanceTask[] = [
  { id: 'mt-1', userId: 'user-1', category: 'HVAC', title: 'Replace HVAC filter', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date('2026-03-15'), estimatedCostUsd: 30, status: 'UPCOMING' },
  { id: 'mt-2', userId: 'user-1', category: 'LAWN', title: 'Spring lawn treatment', frequency: 'ANNUAL', season: 'SPRING', nextDueDate: new Date('2026-03-01'), estimatedCostUsd: 75, status: 'OVERDUE' },
  { id: 'mt-3', userId: 'user-1', category: 'PEST', title: 'Pest control treatment', frequency: 'QUARTERLY', season: 'ANY', nextDueDate: new Date('2026-04-01'), estimatedCostUsd: 100, status: 'UPCOMING' },
];

const sampleShoppingItems: ShoppingItem[] = [
  { id: 'si-1', userId: 'user-1', name: 'Milk', category: 'Dairy', quantity: 1, unit: 'gallon', store: 'Kroger', estimatedPrice: 3.99, isPurchased: false, isRecurring: true, recurringFrequency: 'weekly', addedAt: new Date() },
  { id: 'si-2', userId: 'user-1', name: 'HVAC Filter 20x25x1', category: 'Home', quantity: 4, store: 'Home Depot', estimatedPrice: 12.99, isPurchased: false, isRecurring: false, addedAt: new Date() },
  { id: 'si-3', userId: 'user-1', name: 'Paper Towels', category: 'Household', quantity: 2, unit: 'pack', store: 'Costco', estimatedPrice: 18.99, isPurchased: false, isRecurring: true, recurringFrequency: 'monthly', addedAt: new Date() },
];

const sampleWarranties: WarrantyRecord[] = [
  { id: 'wr-1', userId: 'user-1', itemName: 'Samsung TV 65"', purchaseDate: new Date('2024-11-25'), warrantyEndDate: new Date('2026-11-25'), provider: 'Samsung', claimPhone: '1-800-726-7864', isExpiring: false, isExpired: false },
  { id: 'wr-2', userId: 'user-1', itemName: 'Dyson Vacuum V15', purchaseDate: new Date('2024-06-01'), warrantyEndDate: new Date('2026-06-01'), provider: 'Dyson', isExpiring: true, isExpired: false },
];

const sampleSubscriptions: SubscriptionRecord[] = [
  { id: 'sr-1', userId: 'user-1', name: 'Netflix', costPerMonth: 15.99, billingCycle: 'MONTHLY', renewalDate: new Date('2026-03-01'), category: 'Entertainment', isActive: true, autoRenew: true },
  { id: 'sr-2', userId: 'user-1', name: 'Adobe Creative Cloud', costPerMonth: 54.99, billingCycle: 'ANNUAL', renewalDate: new Date('2026-08-15'), category: 'Software', isActive: true, autoRenew: true },
  { id: 'sr-3', userId: 'user-1', name: 'Gym Membership', costPerMonth: 49.00, billingCycle: 'MONTHLY', renewalDate: new Date('2026-03-10'), category: 'Health', isActive: true, autoRenew: false },
];

const sampleVehicles: VehicleRecord[] = [
  { id: 'vr-1', userId: 'user-1', make: 'Tesla', model: 'Model 3', year: 2024, mileage: 15000, nextServiceDate: new Date('2026-04-01'), nextServiceType: 'Tire Rotation', insuranceExpiry: new Date('2026-09-15'), registrationExpiry: new Date('2026-12-31'), maintenanceHistory: [{ date: new Date('2025-10-01'), type: 'Annual Service', cost: 250, mileage: 12000, provider: 'Tesla Service' }] },
];

export default function HouseholdDashboard() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Household Management</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <MaintenanceCalendar tasks={sampleTasks} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sampleTasks.map(task => (
          <MaintenanceTaskCard key={task.id} task={task} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <ShoppingList items={sampleShoppingItems} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <SubscriptionManager subscriptions={sampleSubscriptions} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <WarrantyTracker warranties={sampleWarranties} />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <VehicleDashboard vehicles={sampleVehicles} />
      </div>
    </div>
  );
}
