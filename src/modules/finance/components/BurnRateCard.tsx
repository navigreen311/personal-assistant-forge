'use client';

import type { BurnRate } from '@/modules/finance/types';

interface Props {
  burnRate: BurnRate;
}

const trendLabels = { INCREASING: 'Increasing', DECREASING: 'Decreasing', STABLE: 'Stable' };
const trendColors = {
  INCREASING: 'text-red-600',
  DECREASING: 'text-green-600',
  STABLE: 'text-gray-600',
};

export default function BurnRateCard({ burnRate }: Props) {
  const isLowRunway = burnRate.runwayMonths < 6;

  return (
    <div className={`rounded-lg border p-4 ${isLowRunway ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <h4 className="text-sm font-semibold text-gray-700">{burnRate.entityName}</h4>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Monthly Burn</p>
          <p className="text-xl font-bold text-gray-900">
            ${burnRate.monthlyBurn.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Runway</p>
          <p className={`text-xl font-bold ${isLowRunway ? 'text-red-600' : 'text-green-600'}`}>
            {burnRate.runwayMonths === Infinity ? '> 99' : burnRate.runwayMonths.toFixed(1)} months
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-gray-500">Trend:</span>
        <span className={`text-xs font-medium ${trendColors[burnRate.trend]}`}>
          {trendLabels[burnRate.trend]}
        </span>
      </div>

      {burnRate.isAboveThreshold && (
        <p className="mt-2 text-xs font-medium text-red-600">
          Burn rate exceeds threshold (${burnRate.threshold.toLocaleString()}/mo)
        </p>
      )}
    </div>
  );
}
