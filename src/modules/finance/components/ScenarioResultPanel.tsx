'use client';

import type { ScenarioModel } from '@/modules/finance/types';

interface Props {
  scenario: ScenarioModel;
}

export default function ScenarioResultPanel({ scenario }: Props) {
  const { projectedImpact } = scenario;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-gray-700">
        Scenario: {scenario.name}
      </h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Revenue Change</p>
          <p className={`text-lg font-bold ${projectedImpact.monthlyRevenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {projectedImpact.monthlyRevenueChange >= 0 ? '+' : ''}
            ${projectedImpact.monthlyRevenueChange.toLocaleString()}/mo
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Expense Change</p>
          <p className={`text-lg font-bold ${projectedImpact.monthlyExpenseChange <= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {projectedImpact.monthlyExpenseChange >= 0 ? '+' : ''}
            ${projectedImpact.monthlyExpenseChange.toLocaleString()}/mo
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">New Burn Rate</p>
          <p className="text-lg font-bold text-gray-900">
            ${projectedImpact.newBurnRate.toLocaleString()}/mo
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">New Runway</p>
          <p className={`text-lg font-bold ${projectedImpact.newRunwayMonths < 6 ? 'text-red-600' : 'text-green-600'}`}>
            {projectedImpact.newRunwayMonths === Infinity
              ? '> 99'
              : projectedImpact.newRunwayMonths.toFixed(1)}{' '}
            months
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <h5 className="mb-2 text-xs font-medium text-gray-500">Adjustments</h5>
        <div className="space-y-1">
          {scenario.adjustments.map((adj, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">
                {adj.type.replace(/_/g, ' ')}: {adj.description}
              </span>
              <span className="font-medium">${adj.monthlyAmount.toLocaleString()}/mo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
