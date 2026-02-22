'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Renewal } from '@/modules/finance/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Entity {
  id: string;
  name: string;
}

interface SubscriptionRow {
  id: string;
  service: string;
  entityId: string;
  entityName: string;
  monthlyCost: number;
  annualCost: number;
  category: string;
  status: 'Active' | 'Paused' | 'Cancelled';
  renewalDate: string;
  autoRenew: boolean;
}

interface RenewalFormData {
  service: string;
  entityId: string;
  monthlyCost: number;
  renewalDate: string;
  category: string;
  autoRenew: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Paused: 'bg-yellow-100 text-yellow-700',
  Cancelled: 'bg-gray-100 text-gray-500',
};

const ENTITY_PILL_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
];

function entityPillColor(entityId: string): string {
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = entityId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ENTITY_PILL_COLORS[Math.abs(hash) % ENTITY_PILL_COLORS.length];
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl p-6 animate-pulse">
      <div className="mb-6 h-5 w-24 rounded bg-gray-200" />
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-10 w-36 rounded bg-gray-200" />
      </div>
      <div className="mb-6 grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-200" />
        ))}
      </div>
      <div className="mb-6 h-64 rounded-lg bg-gray-200" />
      <div className="h-64 rounded-lg bg-gray-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Renewal Modal
// ---------------------------------------------------------------------------

function AddRenewalModal({
  entities,
  onClose,
  onSubmit,
}: {
  entities: Entity[];
  onClose: () => void;
  onSubmit: (data: RenewalFormData) => void;
}) {
  const [form, setForm] = useState<RenewalFormData>({
    service: '',
    entityId: entities[0]?.id ?? '',
    monthlyCost: 0,
    renewalDate: '',
    category: 'SaaS',
    autoRenew: true,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : type === 'number'
            ? parseFloat(value) || 0
            : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Renewal</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Service Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Service Name
            </label>
            <input
              name="service"
              value={form.service}
              onChange={handleChange}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. Slack, AWS, Figma"
            />
          </div>

          {/* Entity */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Entity
            </label>
            <select
              name="entityId"
              value={form.entityId}
              onChange={handleChange}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Monthly Cost */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Monthly Cost ($)
            </label>
            <input
              name="monthlyCost"
              type="number"
              step="0.01"
              min="0"
              value={form.monthlyCost || ''}
              onChange={handleChange}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="29.99"
            />
          </div>

          {/* Renewal Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Renewal Date
            </label>
            <input
              name="renewalDate"
              type="date"
              value={form.renewalDate}
              onChange={handleChange}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="SaaS">SaaS</option>
              <option value="Infrastructure">Infrastructure</option>
              <option value="Marketing">Marketing</option>
              <option value="Communication">Communication</option>
              <option value="Security">Security</option>
              <option value="HR & Payroll">HR &amp; Payroll</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Auto-renew Toggle */}
          <div className="flex items-center gap-3">
            <input
              name="autoRenew"
              type="checkbox"
              checked={form.autoRenew}
              onChange={handleChange}
              id="autoRenew"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="autoRenew" className="text-sm text-gray-700">
              Auto-renew enabled
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Renewal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RenewalsPage() {
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // ---- Fetch entities ----
  useEffect(() => {
    fetch('/api/entities')
      .then((r) => r.json())
      .then((data) => {
        const list: Entity[] = (data.data ?? []).map(
          (e: { id: string; name: string }) => ({ id: e.id, name: e.name })
        );
        setEntities(list);
      })
      .catch(() => {
        // If entity fetch fails, continue with empty list
      });
  }, []);

  // ---- Fetch renewals ----
  const fetchRenewals = useCallback(
    (entityId: string) => {
      setLoading(true);
      const query =
        entityId === 'all'
          ? '/api/finance/renewals'
          : `/api/finance/renewals?entityId=${entityId}`;

      fetch(query)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setRenewals(data.data ?? []);

            // Derive subscriptions from renewal data
            const subs: SubscriptionRow[] = (data.data ?? []).map(
              (r: Renewal) => ({
                id: r.id,
                service: r.name,
                entityId: r.vendor,
                entityName: r.vendor,
                monthlyCost: r.frequency === 'monthly' ? r.amount : r.amount / 12,
                annualCost: r.frequency === 'monthly' ? r.amount * 12 : r.amount,
                category: 'SaaS',
                status: 'Active' as const,
                renewalDate: String(r.nextRenewalDate),
                autoRenew: r.autoRenew,
              })
            );
            setSubscriptions(subs);
          }
        })
        .catch(() => {
          setRenewals([]);
          setSubscriptions([]);
        })
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    fetchRenewals(selectedEntity);
  }, [selectedEntity, fetchRenewals]);

  // ---- Computed stats ----
  const stats = useMemo(() => {
    const totalActive = subscriptions.filter((s) => s.status === 'Active').length;

    const renewingSoon = renewals.filter(
      (r) => r.daysUntilRenewal >= 0 && r.daysUntilRenewal <= 30
    ).length;

    const monthlySaaSCost = subscriptions
      .filter((s) => s.status === 'Active')
      .reduce((sum, s) => sum + s.monthlyCost, 0);

    // Estimate potential savings from paused / underutilized subs
    const potentialSavings = subscriptions
      .filter((s) => s.status === 'Paused')
      .reduce((sum, s) => sum + s.annualCost, 0);

    return { totalActive, renewingSoon, monthlySaaSCost, potentialSavings };
  }, [renewals, subscriptions]);

  // ---- Upcoming renewals (within 30 days) ----
  const upcomingRenewals = useMemo(
    () =>
      renewals
        .filter((r) => r.daysUntilRenewal >= 0 && r.daysUntilRenewal <= 30)
        .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal),
    [renewals]
  );

  // ---- Handlers ----
  const handleAddRenewal = async (data: RenewalFormData) => {
    const res = await fetch('/api/finance/renewals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.service,
        entityId: data.entityId,
        amount: data.monthlyCost,
        frequency: 'monthly',
        nextRenewalDate: data.renewalDate,
        autoRenew: data.autoRenew,
        category: data.category,
      }),
    });
    const result = await res.json();
    if (result.success) {
      setShowModal(false);
      fetchRenewals(selectedEntity);
    }
  };

  const handleAction = async (
    renewalId: string,
    action: 'renew' | 'cancel' | 'negotiate'
  ) => {
    await fetch(`/api/finance/renewals/${renewalId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    fetchRenewals(selectedEntity);
  };

  // ---- Loading State ----
  if (loading) {
    return <LoadingSkeleton />;
  }

  // ---- Render ----
  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Back Link */}
      <Link
        href="/finance"
        className="mb-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Finance
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Renewals &amp; Subscriptions
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Renewal
        </button>
      </div>

      {/* Entity Filter */}
      <div className="mb-6">
        <select
          value={selectedEntity}
          onChange={(e) => setSelectedEntity(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Entities</option>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      </div>

      {/* Stats Bar */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {/* Total Active */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-600">Total Active</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">
            {stats.totalActive}
          </p>
          <p className="text-xs text-blue-500">subscriptions</p>
        </div>

        {/* Renewing Soon */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium text-amber-600">Renewing Soon</p>
            <svg
              className="h-3.5 w-3.5 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700">
            {stats.renewingSoon}
          </p>
          <p className="text-xs text-amber-500">within 30 days</p>
        </div>

        {/* Monthly SaaS Cost */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium text-gray-600">Monthly SaaS Cost</p>
          <p className="mt-1 text-2xl font-bold text-gray-700">
            {formatCurrency(stats.monthlySaaSCost)}
          </p>
          <p className="text-xs text-gray-500">all active</p>
        </div>

        {/* Potential Savings */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-medium text-green-600">Potential Savings</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatCurrency(stats.potentialSavings)}
          </p>
          <p className="text-xs text-green-500">per year</p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* UPCOMING RENEWALS (action needed)                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Upcoming Renewals
        </h2>

        {upcomingRenewals.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No renewals in the next 30 days.</p>
            <p className="mt-1 text-sm text-gray-400">
              You&apos;re all caught up!
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Service</th>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-left">Renews</th>
                  <th className="px-4 py-3 text-left">Action Needed</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingRenewals.map((r) => {
                  const isUrgent = r.daysUntilRenewal <= 7;
                  return (
                    <tr
                      key={r.id}
                      className={isUrgent ? "bg-red-50" : "hover:bg-gray-50"}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.name}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${entityPillColor(r.vendor)}`}
                        >
                          {r.vendor}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(r.nextRenewalDate).toLocaleDateString()}
                        <span className="ml-1 text-xs text-gray-400">
                          ({r.daysUntilRenewal}d)
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isUrgent ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            <svg
                              className="h-3 w-3"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Urgent Review
                          </span>
                        ) : (
                          <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Review Soon
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleAction(r.id, 'renew')}
                            className="rounded bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                          >
                            Renew
                          </button>
                          <button
                            onClick={() => handleAction(r.id, 'cancel')}
                            className="rounded bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleAction(r.id, 'negotiate')}
                            className="rounded bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200"
                          >
                            Negotiate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ALL SUBSCRIPTIONS                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          All Subscriptions
        </h2>

        {subscriptions.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No subscriptions found.</p>
            <p className="mt-1 text-sm text-gray-400">
              Add a renewal to start tracking subscriptions.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Service</th>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-right">Cost/mo</th>
                  <th className="px-4 py-3 text-right">Annual</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {sub.service}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${entityPillColor(sub.entityId)}`}
                      >
                        {sub.entityName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(sub.monthlyCost)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(sub.annualCost)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{sub.category}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[sub.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {sub.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* AI INSIGHTS                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          {/* Lightbulb Icon */}
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-amber-800">
              AI Insights
            </h3>
            <p className="mt-1 text-sm text-amber-700">
              You have 2 underutilized subscriptions based on recent usage
              patterns. Consider canceling or downgrading to save ~$320/yr.
              Review your <strong>Marketing</strong> and{' '}
              <strong>Communication</strong> categories for optimization
              opportunities.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ADD RENEWAL MODAL                                                   */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <AddRenewalModal
          entities={entities}
          onClose={() => setShowModal(false)}
          onSubmit={handleAddRenewal}
        />
      )}
    </div>
  );
}
