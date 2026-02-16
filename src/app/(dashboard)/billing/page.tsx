'use client';

import React, { useCallback, useEffect, useState } from 'react';

// --- Types ---

interface PlanInfo {
  tier: string;
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

interface SubscriptionData {
  planId: string;
  planName: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface UsageData {
  aiTokens: { used: number; limit: number };
  apiCalls: { used: number; limit: number };
  storage: { used: number; limit: number };
}

// --- Static Plan Display ---

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
    tier: 'starter',
    name: 'Starter',
    price: '$29/mo',
    highlighted: true,
    features: [
      '3 entities',
      '10,000 API calls/mo',
      '10 GB storage',
      'Email support',
      'Document storage',
      'Task management',
    ],
  },
  {
    tier: 'professional',
    name: 'Professional',
    price: '$79/mo',
    features: [
      '10 entities',
      '100,000 API calls/mo',
      '50 GB storage',
      'Priority support',
      'AI assistant',
      'Workflow automation',
      'Analytics',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: '$199/mo',
    features: [
      '100 entities',
      '1,000,000 API calls/mo',
      '500 GB storage',
      'Dedicated support',
      'SSO & SAML',
      'Audit logs',
      'Custom integrations',
    ],
  },
];

// --- Skeleton Components ---

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className ?? 'h-4 w-full'}`} />
  );
}

function InvoiceSkeletonRow() {
  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-3"><SkeletonBlock className="h-4 w-20" /></td>
      <td className="px-4 py-3"><SkeletonBlock className="h-4 w-24" /></td>
      <td className="px-4 py-3"><SkeletonBlock className="h-4 w-16" /></td>
      <td className="px-4 py-3"><SkeletonBlock className="h-4 w-12" /></td>
      <td className="px-4 py-3 text-right"><SkeletonBlock className="h-4 w-16 ml-auto" /></td>
    </tr>
  );
}

// --- Component ---

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);

  // Fetch billing/usage data
  useEffect(() => {
    let cancelled = false;
    async function fetchBilling() {
      try {
        const res = await fetch('/api/billing/usage');
        if (!res.ok) throw new Error(`Failed to load billing data (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setSubscription(data.subscription ?? null);
        setUsage(data.usage ?? null);
      } catch (err) {
        if (!cancelled) setBillingError((err as Error).message);
      } finally {
        if (!cancelled) setLoadingBilling(false);
      }
    }
    fetchBilling();
    return () => { cancelled = true; };
  }, []);

  // Fetch invoices
  useEffect(() => {
    let cancelled = false;
    async function fetchInvoices() {
      try {
        const res = await fetch('/api/finance/invoices');
        if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setInvoices(data.invoices ?? []);
      } catch (err) {
        if (!cancelled) setInvoiceError((err as Error).message);
      } finally {
        if (!cancelled) setLoadingInvoices(false);
      }
    }
    fetchInvoices();
    return () => { cancelled = true; };
  }, []);

  // Handle plan change
  const handlePlanChange = useCallback(async (targetTier: string) => {
    setChangingPlan(targetTier);
    try {
      const res = await fetch('/api/billing/budget/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: targetTier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Plan change failed (${res.status})`);
      }
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        // Refresh billing data after successful plan change
        const billingRes = await fetch('/api/billing/usage');
        if (billingRes.ok) {
          const billingData = await billingRes.json();
          setSubscription(billingData.subscription ?? null);
          setUsage(billingData.usage ?? null);
        }
      }
    } catch (err) {
      setBillingError((err as Error).message);
    } finally {
      setChangingPlan(null);
    }
  }, []);

  // Determine current plan tier from subscription
  const currentTier = subscription?.planId
    ? (subscription.planId.replace('plan_', '') || subscription.planId)
    : null;

  const statusLabel = subscription?.status === 'cancelled' || subscription?.status === 'canceled'
    ? 'Canceled'
    : subscription?.status === 'trialing'
      ? 'Trialing'
      : subscription?.status === 'past_due'
        ? 'Past Due'
        : 'Active';

  const statusColor = subscription?.status === 'cancelled' || subscription?.status === 'canceled'
    ? 'bg-red-100 text-red-700'
    : subscription?.status === 'past_due'
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-green-100 text-green-700';

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {/* Global error */}
      {billingError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {billingError}
          <button
            className="ml-3 text-xs underline"
            onClick={() => setBillingError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Current Plan */}
      <section className="mb-8 p-5 border border-gray-200 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Current Plan</h2>
        {loadingBilling ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-6 w-40" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
        ) : subscription ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-blue-600">
                {subscription.planName || PLANS.find((p) => p.tier === currentTier)?.name || currentTier} Plan
              </p>
              <p className="text-sm text-gray-500">
                {PLANS.find((p) => p.tier === currentTier)?.price ?? ''}
              </p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${statusColor}`}>
                {statusLabel}
              </span>
              {renewalDate && (
                <p className="text-xs text-gray-500 mt-1">
                  {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} {renewalDate}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active subscription. Choose a plan below.</p>
        )}
      </section>

      {/* 2. Usage Metrics */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Usage This Period</h2>
        {loadingBilling ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 border border-gray-200 rounded-lg space-y-2">
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-6 w-32" />
                <SkeletonBlock className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : usage ? (
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
        ) : (
          <p className="text-sm text-gray-500">No usage data available.</p>
        )}
      </section>

      {/* 3. Plan Selection */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const isChanging = changingPlan === plan.tier;
            return (
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
                {isCurrent ? (
                  <span className="block text-center py-2 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg">
                    Current Plan
                  </span>
                ) : (
                  <button
                    className="block w-full py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isChanging || changingPlan !== null}
                    onClick={() => handlePlanChange(plan.tier)}
                  >
                    {isChanging
                      ? 'Processing...'
                      : currentTier && PLANS.findIndex((p) => p.tier === plan.tier) >
                        PLANS.findIndex((p) => p.tier === currentTier)
                        ? 'Upgrade'
                        : currentTier
                          ? 'Downgrade'
                          : 'Select'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Payment History */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Payment History</h2>
        {invoiceError && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {invoiceError}
          </div>
        )}
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
              {loadingInvoices ? (
                <>
                  <InvoiceSkeletonRow />
                  <InvoiceSkeletonRow />
                  <InvoiceSkeletonRow />
                </>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
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
                          window.open(`/api/finance/invoices/${inv.id}/download`, '_blank');
                        }}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                window.open('/api/billing/portal', '_blank');
              }}
            >
              Update Payment Method
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Contact support to update payment method if the portal is unavailable.
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
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
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
