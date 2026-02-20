'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  PlanSelector,
  PLANS,
  UsageMeter,
  InvoiceList,
  PaymentMethodCard,
  BillingAlertBanner,
  CostBreakdownChart,
} from '@/modules/billing/components';
import type {
  SubscriptionData,
  UsageData,
  BillingInvoice,
  PaymentMethod,
  BillingAlert,
  CostBreakdownItem,
} from '@/modules/billing/types';

// --- Component ---

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [alerts, setAlerts] = useState<BillingAlert[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdownItem[]>([]);

  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingCosts, setLoadingCosts] = useState(true);

  const [billingError, setBillingError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const fetchBillingData = useCallback(async () => {
    setLoadingBilling(true);
    try {
      const res = await fetch('/api/billing/usage');
      if (!res.ok) throw new Error(`Failed to load billing data (${res.status})`);
      const data = await res.json();

      setSubscription(data.subscription ?? null);
      setUsage(data.usage ?? null);

      if (data.paymentMethod) {
        setPaymentMethod(data.paymentMethod);
      }

      const newAlerts: BillingAlert[] = [];
      if (data.usage) {
        const u = data.usage as UsageData;
        if (u.aiTokens.limit > 0 && u.aiTokens.used / u.aiTokens.limit > 0.9) {
          newAlerts.push({
            id: 'alert-tokens-high',
            severity: u.aiTokens.used / u.aiTokens.limit > 0.95 ? 'critical' : 'warning',
            message: `AI token usage at ${Math.round((u.aiTokens.used / u.aiTokens.limit) * 100)}% of your limit. Consider upgrading your plan.`,
            actionLabel: 'View Plans', actionUrl: '#plans', dismissible: true,
          });
        }
        if (u.apiCalls.limit > 0 && u.apiCalls.used / u.apiCalls.limit > 0.9) {
          newAlerts.push({
            id: 'alert-api-high', severity: 'warning',
            message: `API call usage at ${Math.round((u.apiCalls.used / u.apiCalls.limit) * 100)}% of your limit.`,
            dismissible: true,
          });
        }
        if (u.storage.limit > 0 && u.storage.used / u.storage.limit > 0.85) {
          newAlerts.push({
            id: 'alert-storage-high', severity: 'warning',
            message: `Storage usage at ${Math.round((u.storage.used / u.storage.limit) * 100)}% of your limit.`,
            dismissible: true,
          });
        }
      }

      if (data.subscription) {
        const sub = data.subscription as SubscriptionData;
        if (sub.status === 'past_due') {
          newAlerts.unshift({
            id: 'alert-past-due', severity: 'critical',
            message: 'Your payment is past due. Please update your payment method to avoid service interruption.',
            actionLabel: 'Update Payment', actionUrl: '/api/billing/portal', dismissible: false,
          });
        }
        if (sub.cancelAtPeriodEnd) {
          const endDateStr = new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          newAlerts.push({
            id: 'alert-cancelling', severity: 'info',
            message: `Your subscription will be cancelled at the end of the current period (${endDateStr}).`,
            dismissible: true,
          });
        }
      }

      setAlerts(newAlerts);
    } catch (err) {
      setBillingError((err as Error).message);
    } finally {
      setLoadingBilling(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await fetch('/api/finance/invoices');
      if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
      const data = await res.json();
      setInvoices(data.invoices ?? []);

      const failedInvoices = (data.invoices ?? []).filter(
        (inv: BillingInvoice) => inv.status === 'failed'
      );
      if (failedInvoices.length > 0) {
        setAlerts((prev) => {
          if (prev.some((a) => a.id === 'alert-failed-payment')) return prev;
          return [
            ...prev,
            {
              id: 'alert-failed-payment',
              severity: 'critical' as const,
              message: `${failedInvoices.length} payment(s) failed. Please update your payment method.`,
              actionLabel: 'Update Payment', actionUrl: '/api/billing/portal', dismissible: false,
            },
          ];
        });
      }
    } catch (err) {
      setInvoiceError((err as Error).message);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const fetchCostBreakdown = useCallback(async () => {
    setLoadingCosts(true);
    try {
      const res = await fetch('/api/billing/cost-attribution?entityId=current&limit=10');
      if (!res.ok) throw new Error(`Failed to load cost data (${res.status})`);
      const data = await res.json();

      const attributions = data.data ?? data ?? [];
      if (Array.isArray(attributions) && attributions.length > 0) {
        const totalCost = attributions.reduce(
          (sum: number, a: { totalCostUsd?: number }) => sum + (a.totalCostUsd ?? 0), 0
        );

        const items: CostBreakdownItem[] = attributions.map(
          (a: { workflowName?: string; totalCostUsd?: number }) => ({
            category: a.workflowName ?? 'Unknown',
            amount: a.totalCostUsd ?? 0,
            percentage: totalCost > 0 ? ((a.totalCostUsd ?? 0) / totalCost) * 100 : 0,
            trend: 'stable' as const, changePercent: 0,
          })
        );

        setCostBreakdown(items);
      }
    } catch {
      setCostBreakdown([]);
    } finally {
      setLoadingCosts(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingData();
    fetchInvoices();
    fetchCostBreakdown();
  }, [fetchBillingData, fetchInvoices, fetchCostBreakdown]);

  const handlePlanChange = useCallback(
    async (targetTier: string) => {
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
          await fetchBillingData();
        }
      } catch (err) {
        throw err;
      }
    },
    [fetchBillingData]
  );

  const currentTier = subscription?.planId
    ? subscription.planId.replace('plan_', '') || subscription.planId
    : null;

  const statusLabel =
    subscription?.status === 'cancelled' || subscription?.status === 'canceled'
      ? 'Canceled'
      : subscription?.status === 'trialing'
        ? 'Trialing'
        : subscription?.status === 'past_due'
          ? 'Past Due'
          : 'Active';

  const statusColor =
    subscription?.status === 'cancelled' || subscription?.status === 'canceled'
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
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Billing</h1>

      {billingError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {billingError}
          <button className="ml-3 text-xs underline" onClick={() => setBillingError(null)}>Dismiss</button>
        </div>
      )}

      {alerts.length > 0 && (
        <section className="mb-6">
          <BillingAlertBanner alerts={alerts} />
        </section>
      )}

      <section className="mb-8 p-5 border border-gray-200 rounded-lg bg-white shadow-md">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Current Plan</h2>
        {loadingBilling ? (
          <div className="space-y-2">
            <div className="animate-pulse h-6 w-40 bg-gray-200 rounded" />
            <div className="animate-pulse h-4 w-24 bg-gray-200 rounded" />
          </div>
        ) : subscription ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-blue-600">
                {subscription.planName || PLANS.find((p) => p.tier === currentTier)?.name || currentTier}{' '}
                Plan
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

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Usage This Period</h2>
        <UsageMeter usage={usage} loading={loadingBilling} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Cost Breakdown</h2>
        <CostBreakdownChart items={costBreakdown} loading={loadingCosts} />
      </section>

      <section className="mb-8" id="plans">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Plans</h2>
        <PlanSelector
          currentTier={currentTier}
          onSelectPlan={handlePlanChange}
          disabled={loadingBilling}
        />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Payment History</h2>
        <InvoiceList
          invoices={invoices}
          loading={loadingInvoices}
          error={invoiceError}
        />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-gray-900">Payment Method</h2>
        <PaymentMethodCard
          paymentMethod={paymentMethod}
          loading={loadingBilling}
        />
      </section>
    </div>
  );
}
