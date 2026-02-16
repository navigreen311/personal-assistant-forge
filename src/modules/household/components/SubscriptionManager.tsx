'use client';

import type { SubscriptionRecord } from '../types';

export default function SubscriptionManager({ subscriptions }: { subscriptions: SubscriptionRecord[] }) {
  const active = subscriptions.filter(s => s.isActive);
  const monthlyTotal = active.reduce((sum, s) => {
    return sum + (s.billingCycle === 'ANNUAL' ? s.costPerMonth / 12 : s.costPerMonth);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Subscriptions</h3>
        <div className="text-right">
          <div className="text-sm text-gray-500">Monthly Total</div>
          <div className="text-xl font-bold text-green-600">${monthlyTotal.toFixed(2)}</div>
        </div>
      </div>
      <div className="space-y-2">
        {subscriptions.map(sub => (
          <div key={sub.id} className={`border rounded-lg p-3 ${sub.isActive ? '' : 'opacity-50'}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{sub.name}</div>
                <div className="text-xs text-gray-500">{sub.category} | {sub.billingCycle}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">${sub.costPerMonth.toFixed(2)}/mo</div>
                <div className="text-xs text-gray-500">
                  Renews: {new Date(sub.renewalDate).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              {sub.autoRenew && <span className="px-1 bg-blue-100 text-blue-700 rounded">Auto-renew</span>}
              {!sub.isActive && <span className="px-1 bg-gray-100 text-gray-700 rounded">Inactive</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
