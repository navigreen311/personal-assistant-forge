'use client';

import type { SensitivityResult } from '@/modules/decisions/types';

interface SensitivityChartProps {
  results: SensitivityResult[];
}

const IMPACT_COLORS = {
  NONE: 'bg-gray-100 text-gray-600',
  MINOR: 'bg-yellow-100 text-yellow-700',
  MAJOR: 'bg-red-100 text-red-700',
};

export default function SensitivityChart({ results }: SensitivityChartProps) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Sensitivity Analysis</h4>
      <div className="space-y-2">
        {results.map((r) => (
          <div
            key={r.criterionId}
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
          >
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900">{r.criterionName}</span>
              {r.tippingWeight !== null && (
                <span className="ml-2 text-xs text-gray-500">
                  Tips at {(r.tippingWeight * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${IMPACT_COLORS[r.impactOnRanking]}`}
            >
              {r.impactOnRanking}
            </span>
          </div>
        ))}
      </div>
      {results.every((r) => r.impactOnRanking === 'NONE') && (
        <p className="mt-2 text-xs text-gray-500">
          Ranking is stable across all weight variations.
        </p>
      )}
    </div>
  );
}
