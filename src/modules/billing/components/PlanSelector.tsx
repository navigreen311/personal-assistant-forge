'use client';

import { useState } from 'react';
import type { PlanInfo } from '@/modules/billing/types';

// --- Static plan definitions ---

const PLANS: PlanInfo[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0/mo',
    monthlyPriceUsd: 0,
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
    monthlyPriceUsd: 29,
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
    monthlyPriceUsd: 79,
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
    monthlyPriceUsd: 199,
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

// --- Props ---

interface PlanSelectorProps {
  currentTier: string | null;
  onSelectPlan: (tier: string) => Promise<void>;
  disabled?: boolean;
}

// --- Skeleton ---

function PlanCardSkeleton() {
  return (
    <div className="p-5 border border-gray-200 rounded-lg flex flex-col">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-20 bg-gray-200 rounded" />
        <div className="h-8 w-24 bg-gray-200 rounded" />
        <div className="space-y-2 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-full bg-gray-200 rounded" />
          ))}
        </div>
        <div className="h-10 w-full bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// --- Component ---

export default function PlanSelector({ currentTier, onSelectPlan, disabled }: PlanSelectorProps) {
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (tier: string) => {
    setChangingPlan(tier);
    setError(null);
    try {
      await onSelectPlan(tier);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChangingPlan(null);
    }
  };

  const getButtonLabel = (planTier: string): string => {
    if (!currentTier) return 'Select';
    const currentIndex = PLANS.findIndex((p) => p.tier === currentTier);
    const targetIndex = PLANS.findIndex((p) => p.tier === planTier);
    if (targetIndex > currentIndex) return 'Upgrade';
    if (targetIndex < currentIndex) return 'Downgrade';
    return 'Select';
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button className="ml-3 text-xs underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const isChanging = changingPlan === plan.tier;

          return (
            <div
              key={plan.tier}
              className={`p-5 border rounded-lg flex flex-col shadow-md transition-shadow hover:shadow-lg ${
                plan.highlighted
                  ? 'border-blue-500 ring-2 ring-blue-100'
                  : 'border-gray-200'
              } ${isCurrent ? 'bg-blue-50/30' : 'bg-white'}`}
            >
              {plan.highlighted && (
                <span className="mb-2 inline-block self-start rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
                  Popular
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-2xl font-bold mt-1 mb-4 text-gray-900">{plan.price}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="block text-center py-2 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg bg-gray-50">
                  Current Plan
                </span>
              ) : (
                <button
                  className="block w-full py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isChanging || disabled || changingPlan !== null}
                  onClick={() => handleSelect(plan.tier)}
                >
                  {isChanging ? 'Processing...' : getButtonLabel(plan.tier)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { PLANS };
export { PlanCardSkeleton };
