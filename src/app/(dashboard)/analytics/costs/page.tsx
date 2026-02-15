'use client';

import LLMCostChart from '@/modules/analytics/components/LLMCostChart';
import type { LLMCostDashboard } from '@/modules/analytics/types';

const demoCosts: LLMCostDashboard = {
  entityId: 'demo',
  period: '2026-02',
  totalCostUsd: 187.45,
  byFeature: [
    { feature: 'Email Drafts', cost: 72.3, tokenCount: 7230000 },
    { feature: 'Triage', cost: 45.1, tokenCount: 4510000 },
    { feature: 'Research', cost: 38.25, tokenCount: 3825000 },
    { feature: 'Automation', cost: 31.8, tokenCount: 3180000 },
  ],
  budgetCapUsd: 500,
  percentUsed: 37.49,
  projectedMonthEnd: 374.9,
  alerts: [],
};

export default function CostsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">LLM Cost Dashboard</h2>

      <LLMCostChart dashboard={demoCosts} />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Feature Breakdown</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left text-gray-500">Feature</th>
              <th className="pb-2 text-right text-gray-500">Cost</th>
              <th className="pb-2 text-right text-gray-500">Tokens</th>
              <th className="pb-2 text-right text-gray-500">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {demoCosts.byFeature.map((f) => (
              <tr key={f.feature} className="border-b border-gray-50">
                <td className="py-2 font-medium text-gray-700">{f.feature}</td>
                <td className="py-2 text-right">${f.cost.toFixed(2)}</td>
                <td className="py-2 text-right text-gray-500">
                  {(f.tokenCount / 1000000).toFixed(1)}M
                </td>
                <td className="py-2 text-right">
                  {((f.cost / demoCosts.totalCostUsd) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
