'use client';

import { useState } from 'react';
import type { ServiceProvider } from '../types';
import AddProviderModal from './AddProviderModal';

// ─── Types ──────────────────────────────────────────────────────────────────
interface HouseholdProvidersTabProps {
  providers?: ServiceProvider[];
  onAddProvider?: (provider: Partial<ServiceProvider>) => void;
  onRefresh?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Lawn Care',
  'Cleaning',
  'Pest Control',
  'Roofing',
  'Painting',
  'General Handyman',
  'Appliance Repair',
] as const;

const CATEGORY_ICONS: Record<string, string> = {
  'Plumbing': '🔧',
  'Electrical': '⚡',
  'HVAC': '🌡',
  'Lawn Care': '🌿',
  'Cleaning': '🧹',
  'Pest Control': '🐛',
  'Roofing': '🏗',
  'Painting': '🎨',
  'General Handyman': '🔨',
  'Appliance Repair': '🏠',
};

const RATING_OPTIONS = [
  { label: 'All Ratings', value: 0 },
  { label: '4+ Stars', value: 4 },
  { label: '4.5+ Stars', value: 4.5 },
];

const DEMO_PROVIDERS: ServiceProvider[] = [
  {
    id: 'p1',
    userId: 'u1',
    name: 'ABC Services',
    category: 'General Handyman',
    phone: '702-555-0100',
    email: 'info@abcservices.com',
    rating: 4.8,
    lastUsed: new Date('2026-02-15'),
    notes: 'Reliable, fast turnaround',
    costHistory: [
      { date: new Date('2026-02-15'), amount: 185, service: 'Faucet repair' },
      { date: new Date('2026-01-10'), amount: 120, service: 'Doorknob replacement' },
      { date: new Date('2025-11-05'), amount: 250, service: 'Drywall patching' },
    ],
  },
  {
    id: 'p2',
    userId: 'u1',
    name: 'Green Lawn Co',
    category: 'Lawn Care',
    phone: '702-555-0200',
    email: 'contact@greenlawn.com',
    rating: 4.5,
    lastUsed: new Date('2026-02-20'),
    notes: 'Active contract: Weekly mowing',
    costHistory: [
      { date: new Date('2026-02-20'), amount: 75, service: 'Weekly mowing' },
      { date: new Date('2026-02-13'), amount: 75, service: 'Weekly mowing' },
    ],
  },
  {
    id: 'p3',
    userId: 'u1',
    name: 'Cool Air HVAC',
    category: 'HVAC',
    phone: '702-555-0300',
    email: 'service@coolair.com',
    rating: 4.7,
    lastUsed: new Date('2025-12-01'),
    notes: 'Licensed & insured, same-day emergency service',
    costHistory: [
      { date: new Date('2025-12-01'), amount: 250, service: 'AC tune-up' },
    ],
  },
  {
    id: 'p4',
    userId: 'u1',
    name: "Mike's Plumbing",
    category: 'Plumbing',
    phone: '702-555-0400',
    email: 'mike@mikesplumbing.com',
    rating: 4.2,
    lastUsed: new Date('2026-02-18'),
    notes: 'Emergency service available 24/7',
    costHistory: [
      { date: new Date('2026-02-18'), amount: 185, service: 'Kitchen faucet repair' },
      { date: new Date('2025-08-10'), amount: 340, service: 'Water heater flush' },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function renderStars(rating: number) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const stars: string[] = [];

  for (let i = 0; i < fullStars; i++) stars.push('★');
  if (hasHalf) stars.push('½');
  while (stars.length < 5) stars.push('☆');

  return (
    <span className="text-yellow-400 tracking-wide" title={`${rating.toFixed(1)} / 5`}>
      {stars.join('')}{' '}
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function formatDate(date: Date | undefined): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? '🔨';
}

// ─── Provider Card ──────────────────────────────────────────────────────────
function ProviderCard({ provider }: { provider: ServiceProvider }) {
  const totalJobs = provider.costHistory.length;
  const totalSpent = provider.costHistory.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Top row: Icon + Name + Rating */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xl">
            {getCategoryIcon(provider.category)}
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              {provider.name}
            </h4>
            <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 mt-0.5">
              {provider.category}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {renderStars(provider.rating)}
        </div>
      </div>

      {/* Contact info */}
      <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
        {provider.phone && (
          <div className="flex items-center gap-2">
            <span className="text-xs">📞</span>
            <span className="font-mono text-xs">{provider.phone}</span>
          </div>
        )}
        {provider.email && (
          <div className="flex items-center gap-2">
            <span className="text-xs">📧</span>
            <span className="text-xs">{provider.email}</span>
          </div>
        )}
      </div>

      {/* Usage stats */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Last used: {formatDate(provider.lastUsed)}</span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>{totalJobs} job{totalJobs !== 1 ? 's' : ''}</span>
        {totalSpent > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>${totalSpent.toLocaleString()} total</span>
          </>
        )}
      </div>

      {/* Notes */}
      {provider.notes && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic">
          {provider.notes}
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {provider.phone && (
          <a
            href={`tel:${provider.phone}`}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            📞 Call
          </a>
        )}
        {provider.email && (
          <a
            href={`mailto:${provider.email}`}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            📧 Message
          </a>
        )}
        <button className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
          📅 Book
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          ✏ Edit
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function HouseholdProvidersTab({
  providers: propProviders = [],
  onAddProvider,
  onRefresh,
}: HouseholdProvidersTabProps) {
  const [localProviders, setLocalProviders] = useState<ServiceProvider[]>(
    propProviders.length > 0 ? propProviders : DEMO_PROVIDERS
  );
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = localProviders.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone && p.phone.includes(search));
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    const matchesRating = p.rating >= ratingFilter;
    return matchesSearch && matchesCategory && matchesRating;
  });

  const isEmpty = localProviders.length === 0;

  // ── Add Provider Handler ──────────────────────────────────────────────────
  function handleAddProvider(provider: Partial<ServiceProvider>) {
    const newProvider: ServiceProvider = {
      id: `p-${Date.now()}`,
      userId: 'u1',
      name: provider.name ?? 'Unnamed Provider',
      category: provider.category ?? 'General Handyman',
      phone: provider.phone,
      email: provider.email,
      rating: provider.rating ?? 0,
      notes: provider.notes,
      costHistory: [],
    };
    setLocalProviders((prev) => [...prev, newProvider]);
    onAddProvider?.(provider);
  }

  // ── Empty State ───────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Service Providers
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add Provider
          </button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 py-16 px-6 text-center">
          <div className="text-4xl mb-4">🔧</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No providers yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
            Add your service providers so AI can auto-book maintenance when due.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Add Provider
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">
              ✨ AI: Find providers in my area
            </button>
          </div>
        </div>

        <AddProviderModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddProvider}
        />
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Service Providers
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add Provider
        </button>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Rating filter */}
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(parseFloat(e.target.value))}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {RATING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Provider Cards Grid ──────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 py-12 px-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No providers match your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-3 shadow-sm text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {localProviders.length} provider{localProviders.length !== 1 ? 's' : ''} total
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Avg rating: {(localProviders.reduce((sum, p) => sum + p.rating, 0) / localProviders.length).toFixed(1)} / 5
        </span>
      </div>

      {/* ── Add Provider Modal ─────────────────────────────────────────────── */}
      <AddProviderModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddProvider}
      />
    </div>
  );
}
