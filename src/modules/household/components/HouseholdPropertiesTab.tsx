'use client';

import { useState } from 'react';
import type { Property } from '../types';
import AddPropertyModal from './AddPropertyModal';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HouseholdPropertiesTabProps {
  entityId?: string;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<Property['type'], string> = {
  PRIMARY: 'Primary Residence',
  RENTAL: 'Rental',
  VACATION: 'Vacation',
  COMMERCIAL: 'Commercial',
};

const TYPE_STYLES: Record<Property['type'], string> = {
  PRIMARY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  RENTAL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  VACATION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  COMMERCIAL: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const OWNERSHIP_LABELS: Record<Property['ownership'], string> = {
  OWN: 'Own',
  RENT: 'Rent',
  MANAGE: 'Manage',
};

function formatCurrency(amount: number) {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function totalMonthlyCost(costs: Property['monthlyCosts']) {
  return costs.mortgage + costs.insurance + costs.utilities + costs.hoa + costs.maintenance;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_PROPERTIES: Property[] = [
  {
    id: 'prop-1',
    userId: 'user-1',
    name: '123 Main Street',
    address: '123 Main Street',
    city: 'Las Vegas',
    state: 'NV',
    type: 'PRIMARY',
    ownership: 'OWN',
    moveInDate: new Date('2021-06-15'),
    beds: 4,
    baths: 3,
    sqft: 2400,
    yearBuilt: 2018,
    monthlyCosts: { mortgage: 2100, insurance: 180, utilities: 320, hoa: 75, maintenance: 150 },
    activeTasks: 5,
    overdueTasks: 1,
    providerCount: 4,
  },
  {
    id: 'prop-2',
    userId: 'user-1',
    name: '456 Rental Ave',
    address: '456 Rental Ave',
    city: 'Henderson',
    state: 'NV',
    type: 'RENTAL',
    ownership: 'MANAGE',
    moveInDate: new Date('2023-01-01'),
    beds: 3,
    baths: 2,
    sqft: 1600,
    yearBuilt: 2015,
    monthlyCosts: { mortgage: 1500, insurance: 140, utilities: 0, hoa: 50, maintenance: 100 },
    activeTasks: 3,
    overdueTasks: 2,
    providerCount: 2,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HouseholdPropertiesTab({
  entityId: _entityId,
  onRefresh: _onRefresh,
}: HouseholdPropertiesTabProps) {
  const [properties, setProperties] = useState<Property[]>(MOCK_PROPERTIES);
  const [showAddModal, setShowAddModal] = useState(false);

  function handleAddProperty(property: Omit<Property, 'id' | 'userId' | 'activeTasks' | 'overdueTasks' | 'providerCount'>) {
    const newProperty: Property = {
      ...property,
      id: crypto.randomUUID(),
      userId: 'user-1',
      activeTasks: 0,
      overdueTasks: 0,
      providerCount: 0,
    };
    setProperties((prev) => [...prev, newProperty]);
    setShowAddModal(false);
  }

  // ── Empty state ──
  if (properties.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Properties</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add Property
          </button>
        </div>

        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <span className="text-3xl">🏠</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No properties yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Add a property to get AI-generated maintenance schedules.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add Property
          </button>
        </div>

        {showAddModal && (
          <AddPropertyModal
            onClose={() => setShowAddModal(false)}
            onSave={handleAddProperty}
          />
        )}
      </div>
    );
  }

  // ── Properties list ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Properties</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add Property
        </button>
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {properties.map((property) => (
          <div
            key={property.id}
            className="rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            {/* Card header */}
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-2xl">🏠</span>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {property.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {property.city}, {property.state}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[property.type]}`}
                >
                  {TYPE_LABELS[property.type]}
                </span>
                <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {OWNERSHIP_LABELS[property.ownership]}
                </span>
              </div>
            </div>

            {/* Property details */}
            <div className="px-5 py-4 space-y-4">
              {/* Specs */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                {property.beds != null && (
                  <span className="flex items-center gap-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{property.beds}</span> beds
                  </span>
                )}
                {property.baths != null && (
                  <span className="flex items-center gap-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{property.baths}</span> baths
                  </span>
                )}
                {property.sqft != null && (
                  <span className="flex items-center gap-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{property.sqft.toLocaleString()}</span> sqft
                  </span>
                )}
                {property.yearBuilt != null && (
                  <span className="flex items-center gap-1">
                    Built <span className="font-medium text-gray-900 dark:text-gray-100">{property.yearBuilt}</span>
                  </span>
                )}
              </div>

              {/* Monthly costs breakdown */}
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Monthly Costs
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Mortgage</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(property.monthlyCosts.mortgage)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Insurance</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(property.monthlyCosts.insurance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Utilities</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(property.monthlyCosts.utilities)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">HOA</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(property.monthlyCosts.hoa)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Maintenance</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(property.monthlyCosts.maintenance)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Total</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(totalMonthlyCost(property.monthlyCosts))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {property.activeTasks}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">Active tasks</span>
                </div>
                {property.overdueTasks > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {property.overdueTasks}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">Overdue</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {property.providerCount}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">Providers</span>
                </div>
              </div>
            </div>

            {/* Card actions */}
            <div className="flex items-center gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                View details
              </button>
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                ✏ Edit
              </button>
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                📅 Maintenance schedule
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Property Modal */}
      {showAddModal && (
        <AddPropertyModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddProperty}
        />
      )}
    </div>
  );
}
