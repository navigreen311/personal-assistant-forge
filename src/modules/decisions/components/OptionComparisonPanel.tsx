'use client';

import type { DecisionOption } from '@/modules/decisions/types';

interface OptionComparisonPanelProps {
  options: DecisionOption[];
  recommendation?: string;
}

const STRATEGY_COLORS = {
  CONSERVATIVE: 'border-blue-300 bg-blue-50',
  MODERATE: 'border-purple-300 bg-purple-50',
  AGGRESSIVE: 'border-red-300 bg-red-50',
};

const RISK_COLORS = {
  LOW: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-red-600',
};

export default function OptionComparisonPanel({
  options,
  recommendation,
}: OptionComparisonPanelProps) {
  return (
    <div>
      {recommendation && (
        <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 p-3">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Recommendation:</span> {recommendation}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {options.map((option) => (
          <div
            key={option.id}
            className={`rounded-lg border-2 p-4 ${STRATEGY_COLORS[option.strategy]}`}
          >
            <h4 className="font-semibold text-gray-900">{option.label}</h4>
            <span className="inline-block mt-1 text-xs font-medium text-gray-500 uppercase">
              {option.strategy}
            </span>

            <p className="mt-2 text-sm text-gray-700">{option.description}</p>

            <div className="mt-3">
              <h5 className="text-xs font-semibold text-green-700 uppercase">Pros</h5>
              <ul className="mt-1 space-y-1">
                {option.pros.map((pro, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                    <span className="text-green-500 shrink-0">+</span> {pro}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3">
              <h5 className="text-xs font-semibold text-red-700 uppercase">Cons</h5>
              <ul className="mt-1 space-y-1">
                {option.cons.map((con, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                    <span className="text-red-500 shrink-0">-</span> {con}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div>
                <span className="font-medium">Cost:</span> ${option.estimatedCost.toLocaleString()}
              </div>
              <div>
                <span className="font-medium">Timeline:</span> {option.estimatedTimeline}
              </div>
              <div>
                <span className="font-medium">Risk:</span>{' '}
                <span className={RISK_COLORS[option.riskLevel]}>{option.riskLevel}</span>
              </div>
              <div>
                <span className="font-medium">Reversibility:</span> {option.reversibility}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
