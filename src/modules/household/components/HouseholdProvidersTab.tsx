'use client';

import { useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Provider {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  website: string;
  rating: number;
  lastUsed: string;
  notes: string;
}

interface HouseholdProvidersTabProps {
  entityId?: string;
  property?: string;
  onRefresh?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Lawn',
  'Cleaning',
  'Pest Control',
  'Roofing',
  'Painting',
  'General Handyman',
] as const;

const DEMO_PROVIDERS: Provider[] = [
  {
    id: '1',
    name: 'ABC Services',
    category: 'General Handyman',
    phone: '702-555-0100',
    email: 'info@abcservices.com',
    website: 'https://abcservices.com',
    rating: 4.8,
    lastUsed: 'Feb 15',
    notes: 'Reliable, fast turnaround',
  },
  {
    id: '2',
    name: 'Green Lawn Co',
    category: 'Lawn',
    phone: '702-555-0200',
    email: 'contact@greenlawn.com',
    website: 'https://greenlawn.com',
    rating: 4.5,
    lastUsed: 'Feb 14',
    notes: 'Weekly mowing service',
  },
  {
    id: '3',
    name: "Mike's Plumbing",
    category: 'Plumbing',
    phone: '702-555-0300',
    email: 'mike@mikesplumbing.com',
    website: 'https://mikesplumbing.com',
    rating: 4.2,
    lastUsed: 'Jan 28',
    notes: 'Emergency service available 24/7',
  },
];

const RATING_OPTIONS = [
  { label: 'All Ratings', value: 0 },
  { label: '4+ Stars', value: 4 },
  { label: '4.5+ Stars', value: 4.5 },
];

const EMPTY_FORM: Omit<Provider, 'id'> = {
  name: '',
  category: '',
  phone: '',
  email: '',
  website: '',
  rating: 0,
  lastUsed: '',
  notes: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function renderStars(rating: number) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const stars: string[] = [];

  for (let i = 0; i < fullStars; i++) stars.push('★');
  if (hasHalf) stars.push('½');
  while (stars.length < 5) stars.push('☆');

  return (
    <span className="text-yellow-400 tracking-wide" title={` / 5`}>
      {stars.join('')}{' '}
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function HouseholdProvidersTab({
  entityId,
  property,
  onRefresh,
}: HouseholdProvidersTabProps) {
  const [providers, setProviders] = useState<Provider[]>(DEMO_PROVIDERS);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [autoBook, setAutoBook] = useState(true);
  const [newProvider, setNewProvider] = useState<Omit<Provider, 'id'>>(EMPTY_FORM);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = providers.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search);
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    const matchesRating = p.rating >= ratingFilter;
    return matchesSearch && matchesCategory && matchesRating;
  });

  // ── Add Provider ──────────────────────────────────────────────────────────
  function handleSave() {
    if (!newProvider.name || !newProvider.category) return;

    const provider: Provider = {
      ...newProvider,
      id: crypto.randomUUID(),
      lastUsed: 'Never',
      rating: newProvider.rating || 0,
    };

    setProviders((prev) => [...prev, provider]);
    setNewProvider(EMPTY_FORM);
    setShowAddForm(false);
    onRefresh?.();
  }

  function handleCancel() {
    setNewProvider(EMPTY_FORM);
    setShowAddForm(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Service Providers
        </h2>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add Provider
        </button>
      </div>

      {/* ── Add Provider Form (slide-down) ─────────────────────────────────── */}
      {showAddForm && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm animate-in slide-in-from-top duration-200">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            New Provider
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Provider name"
                value={newProvider.name}
                onChange={(e) =>
                  setNewProvider((p) => ({ ...p, name: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={newProvider.category}
                onChange={(e) =>
                  setNewProvider((p) => ({ ...p, category: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                placeholder="702-555-0000"
                value={newProvider.phone}
                onChange={(e) =>
                  setNewProvider((p) => ({ ...p, phone: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="provider@email.com"
                value={newProvider.email}
                onChange={(e) =>
                  setNewProvider((p) => ({ ...p, email: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Website
              </label>
              <input
                type="url"
                placeholder="https://example.com"
                value={newProvider.website}
                onChange={(e) =>
                  setNewProvider((p) => ({ ...p, website: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rating
              </label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                placeholder="0.0 - 5.0"
                value={newProvider.rating || ''}
                onChange={(e) =>
                  setNewProvider((p) => ({
                    ...p,
                    rating: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Notes - full width */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                placeholder="Any notes about this provider..."
                value={newProvider.notes}
                onChange={(e) =>
                  setNewProvider((p) => ({ ...p, notes: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* Form actions */}
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!newProvider.name || !newProvider.category}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save Provider
            </button>
          </div>
        </div>
      )}

      {/* ── Filter Bar ─────────────────────────────────────────────────── */}
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

      {/* ── Provider Table ─────────────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Provider
                </th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Category
                </th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Phone
                </th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Rating
                </th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  Last Used
                </th>
                <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                  >
                    No providers match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                        {p.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {p.phone}
                    </td>
                    <td className="px-4 py-3">{renderStars(p.rating)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {p.lastUsed}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <a
                          href={`tel:${p.phone}`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          title={`Call ${p.name}`}
                        >
                          📞 Call
                        </a>
                        <a
                          href={`mailto:${p.email}`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          title={`Email ${p.name}`}
                        >
                          📧 Email
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Auto-book Toggle ───────────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 px-4 py-3 shadow-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoBook}
            onChange={(e) => setAutoBook(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            ☑ Auto-book via VoiceForge when maintenance is due
          </span>
        </label>
      </div>
    </div>
  );
}
