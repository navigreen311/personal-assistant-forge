'use client';

import React, { useState } from 'react';

// --- Types ---

type PlanTier = 'free' | 'pro' | 'enterprise';

interface PlanInfo {
  tier: PlanTier;
  name: string;
  price: string;
  features: string[];
  highlighted?: boolean;
}

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
}

// --- Mock Data ---

const PLANS: PlanInfo[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0/mo',
    features: [
      '1 entity',
      '1,000 AI tokens/mo',
      '100 API calls/day',
      '1 GB storage',
      'Community support',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$29/mo',
    highlighted: true,
    features: [
      '5 entities',
      '50,000 AI tokens/mo',
      '10,000 API calls/day',
      '25 GB storage',
      'Priority support',
      'Advanced analytics',
      'Custom workflows',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: '$99/mo',
    features: [
      'Unlimited entities',
      '500,000 AI tokens/mo',
      'Unlimited API calls',
      '100 GB storage',
      'Dedicated support',
      'SSO & SAML',
      'Audit logs',
      'Custom integrations',
    ],
  },
];

const MOCK_INVOICES: Invoice[] = [
  { id: 'inv_001', date: '2026-01-15', amount: '$29.00', status: 'paid' },
  { id: 'inv_002', date: '2025-12-15', amount: '$29.00', status: 'paid' },
  { id: 'inv_003', date: '2025-11-15', amount: '$29.00', status: 'paid' },
  { id: 'inv_004', date: '2025-10-15', amount: '$29.00', status: 'paid' },
];

// --- Component ---

export default function BillingPage() {
  const [currentPlan] = useState<PlanTier>('pro');
  const renewalDate = '2026-03-15';

  // Mock usage data
  const usage = {
    aiTokens: { used: 32_450, limit: 50_000 },
    apiCalls: { used: 4_280, limit: 10_000 },
    storage: { used: 8.3, limit: 25 },
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {/* 1. Current Plan */}
      <section className="mb-8 p-5 border border-gray-200 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Current Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-blue-600">
              {PLANS.find((p) => p.tier === currentPlan)?.name} Plan
            </p>
            <p className="text-sm text-gray-500">
              {PLANS.find((p) => p.tier === currentPlan)?.price}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              Active
            </span>
            <p className="text-xs text-gray-500 mt-1">Renews {renewalDate}</p>
          </div>
        </div>
      </section>

      {/* 2. Usage Metrics */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Usage This Period</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <UsageCard
            label="AI Tokens"
            used={usage.aiTokens.used}
            limit={usage.aiTokens.limit}
            format={(v) => v.toLocaleString()}
          />
          <UsageCard
            label="API Calls"
            used={usage.apiCalls.used}
            limit={usage.apiCalls.limit}
            format={(v) => v.toLocaleString()}
          />
          <UsageCard
            label="Storage"
            used={usage.storage.used}
            limit={usage.storage.limit}
            format={(v) => `${v} GB`}
          />
        </div>
      </section>

      {/* 3. Plan Selection */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`p-5 border rounded-lg flex flex-col ${
                plan.highlighted
                  ? 'border-blue-500 ring-2 ring-blue-100'
                  : 'border-gray-200'
              }`}
            >
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="text-2xl font-bold mt-1 mb-4">{plan.price}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.tier === currentPlan ? (
                <span className="block text-center py-2 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg">
                  Current Plan
                </span>
              ) : (
                <button
                  className="block w-full py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                  onClick={() => {
                    // TODO: Integrate with Stripe for plan changes
                    alert('Plan changes coming soon! Stripe integration not yet wired.');
                  }}
                >
                  {PLANS.findIndex((p) => p.tier === plan.tier) >
                  PLANS.findIndex((p) => p.tier === currentPlan)
                    ? 'Upgrade'
                    : 'Downgrade'}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Plan changes are coming soon. Stripe integration is not yet active.
        </p>
      </section>

      {/* 4. Payment History */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Payment History</h2>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm" aria-label="Payment history">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs">{inv.id}</td>
                  <td className="px-4 py-3">{inv.date}</td>
                  <td className="px-4 py-3">{inv.amount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        inv.status === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : inv.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-blue-500 hover:underline"
                      onClick={() => {
                        // TODO: Integrate invoice download with Stripe
                        alert('Invoice download coming soon.');
                      }}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">Payment history is placeholder data.</p>
      </section>

      {/* 5. Payment Method */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Payment Method</h2>
        <div className="p-5 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-gray-100 border border-gray-200 rounded flex items-center justify-center text-xs font-bold text-gray-500">
                VISA
              </div>
              <div>
                <p className="text-sm font-medium">****  ****  ****  4242</p>
                <p className="text-xs text-gray-500">Expires 12/2027</p>
              </div>
            </div>
            <button
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => {
                // TODO: Integrate with Stripe payment method update
                alert('Payment method update coming soon. Stripe integration not yet wired.');
              }}
            >
              Update Payment Method
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Payment method is placeholder data. Stripe integration coming soon.
          </p>
        </div>
      </section>
    </div>
  );
}

// --- Sub-components ---

function UsageCard({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number;
  format: (v: number) => string;
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-blue-500';

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-lg font-bold">
        {format(used)} <span className="text-sm font-normal text-gray-400">/ {format(limit)}</span>
      </p>
      <div className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} usage`}>
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-1">{pct}% used</p>
    </div>
  );
}
