'use client';

import { useState, useMemo } from 'react';
import type { InventoryItem } from '../types';
import AddInventoryModal from './AddInventoryModal';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HouseholdInventoryTabProps {
  entityId?: string;
  property?: string;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<InventoryItem['category'], string> = {
  APPLIANCE: 'Appliance',
  HVAC: 'HVAC',
  ELECTRONICS: 'Electronics',
  FURNITURE: 'Furniture',
  OUTDOOR: 'Outdoor',
  OTHER: 'Other',
};

const CATEGORY_STYLES: Record<InventoryItem['category'], string> = {
  APPLIANCE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  HVAC: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ELECTRONICS: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  FURNITURE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  OUTDOOR: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_PROPERTIES = [
  { id: 'prop-1', name: '123 Main Street' },
  { id: 'prop-2', name: '456 Rental Ave' },
];

const MOCK_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-1',
    userId: 'user-1',
    itemName: 'Samsung Refrigerator RF28T5001SR',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'APPLIANCE',
    purchaseDate: new Date('2023-03-15'),
    warrantyEndDate: new Date('2027-03-15'),
    value: 1800,
    serialNumber: 'RF28T-20230315-001',
    modelNumber: 'RF28T5001SR',
    notes: 'French door, stainless steel',
  },
  {
    id: 'inv-2',
    userId: 'user-1',
    itemName: 'Carrier Central AC Unit',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'HVAC',
    purchaseDate: new Date('2022-06-01'),
    warrantyEndDate: new Date('2026-06-01'),
    value: 8500,
    serialNumber: 'CAR-24XCB636-001',
    modelNumber: '24XCB636A003',
    notes: '3-ton, 16 SEER',
  },
  {
    id: 'inv-3',
    userId: 'user-1',
    itemName: 'Bosch 500 Series Washer',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'APPLIANCE',
    purchaseDate: new Date('2023-08-20'),
    warrantyEndDate: new Date('2026-08-20'),
    value: 1200,
    serialNumber: 'BOSCH-WAT28400-002',
    modelNumber: 'WAT28400UC',
  },
  {
    id: 'inv-4',
    userId: 'user-1',
    itemName: 'LG ThinQ Dryer',
    propertyId: 'prop-2',
    propertyName: '456 Rental Ave',
    category: 'APPLIANCE',
    purchaseDate: new Date('2023-08-20'),
    warrantyEndDate: new Date('2025-08-20'),
    value: 1100,
    serialNumber: 'LG-DLEX8000-003',
    modelNumber: 'DLEX8000V',
  },
  {
    id: 'inv-5',
    userId: 'user-1',
    itemName: 'Ring Video Doorbell Pro 2',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'ELECTRONICS',
    purchaseDate: new Date('2024-01-10'),
    warrantyEndDate: new Date('2026-01-10'),
    value: 250,
    serialNumber: 'RING-VDP2-004',
    modelNumber: 'B086Q5BKZS',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number) {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'none';

function getWarrantyStatus(warrantyEndDate?: Date): WarrantyStatus {
  if (!warrantyEndDate) return 'none';
  const now = new Date();
  const end = new Date(warrantyEndDate);
  if (end < now) return 'expired';
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  if (end <= sixMonthsFromNow) return 'expiring';
  return 'active';
}

function warrantyBadge(status: WarrantyStatus) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Active
        </span>
      );
    case 'expiring':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          Expiring
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Expired
        </span>
      );
    case 'none':
      return (
        <span className="text-sm text-gray-400 dark:text-gray-500">&mdash;</span>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HouseholdInventoryTab({
  entityId: _entityId,
  property: _property,
  onRefresh: _onRefresh,
}: HouseholdInventoryTabProps) {
  const [items, setItems] = useState<InventoryItem[]>(MOCK_INVENTORY);
  const [showAddModal, setShowAddModal] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // ── Derived data ──
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (propertyFilter !== 'all' && item.propertyId !== propertyFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      return true;
    });
  }, [items, propertyFilter, categoryFilter]);

  const totalValue = filteredItems.reduce((sum, item) => sum + item.value, 0);

  const expiringCount = filteredItems.filter(
    (item) => getWarrantyStatus(item.warrantyEndDate) === 'expiring'
  ).length;

  function handleAddItem(item: Omit<InventoryItem, 'id' | 'userId'>) {
    const newItem: InventoryItem = {
      ...item,
      id: crypto.randomUUID(),
      userId: 'user-1',
    };
    setItems((prev) => [...prev, newItem]);
    setShowAddModal(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Home Inventory</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track your home items, warranties, and total insured value.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="all">All Properties</option>
          {MOCK_PROPERTIES.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="all">All Categories</option>
          {(Object.entries(CATEGORY_LABELS) as [InventoryItem['category'], string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
              <tr>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Item</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Property</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Category</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Purchase Date</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Warranty Status</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">
                    No inventory items match your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const status = getWarrantyStatus(item.warrantyEndDate);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{item.itemName}</span>
                        {item.modelNumber && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">{item.modelNumber}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{item.propertyName}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_STYLES[item.category]}`}>
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatDate(item.purchaseDate)}</td>
                      <td className="px-5 py-3">{warrantyBadge(status)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(item.value)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer stats */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-6">
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400">Total insured value:</span>{' '}
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalValue)}
              </span>
            </div>
            {expiringCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-xs dark:bg-yellow-900/30">
                  ⚠
                </span>
                <span className="text-sm text-yellow-700 dark:text-yellow-400">
                  {expiringCount} {expiringCount === 1 ? 'warranty' : 'warranties'} expiring within 6 months
                </span>
              </div>
            )}
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            📤 Export for insurance
          </button>
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <AddInventoryModal
          properties={MOCK_PROPERTIES}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddItem}
        />
      )}
    </div>
  );
}
