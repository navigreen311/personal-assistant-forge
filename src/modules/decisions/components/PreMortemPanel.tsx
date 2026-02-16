'use client';

import type { PreMortemResult } from '@/modules/decisions/types';

interface PreMortemPanelProps {
  result: PreMortemResult;
}

const PROB_COLORS = {
  LOW: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-red-600',
};

const CATEGORY_ICONS: Record<string, string> = {
  FINANCIAL: '$',
  OPERATIONAL: 'O',
  REPUTATIONAL: 'R',
  LEGAL: 'L',
  TECHNICAL: 'T',
};

export default function PreMortemPanel({ result }: PreMortemPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Pre-Mortem Analysis</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Risk Score:</span>
          <span
            className={`text-sm font-bold ${
              result.overallRiskScore > 66
                ? 'text-red-600'
                : result.overallRiskScore > 33
                  ? 'text-yellow-600'
                  : 'text-green-600'
            }`}
          >
            {result.overallRiskScore}/100
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {result.failureScenarios.map((scenario) => (
          <div key={scenario.id} className="rounded border border-gray-200 p-3">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-gray-900">{scenario.description}</p>
              <span className="ml-2 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                {CATEGORY_ICONS[scenario.category] ?? '?'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Root cause: {scenario.rootCause}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <span>
                Probability:{' '}
                <span className={PROB_COLORS[scenario.probability]}>{scenario.probability}</span>
              </span>
              <span>
                Impact:{' '}
                <span className={PROB_COLORS[scenario.impact]}>{scenario.impact}</span>
              </span>
            </div>

            {result.mitigationPlan
              .filter((m) => m.scenarioId === scenario.id)
              .map((m, i) => (
                <div key={i} className="mt-2 rounded bg-green-50 p-2 text-xs text-green-800">
                  <span className="font-medium">Mitigation:</span> {m.action}
                </div>
              ))}
          </div>
        ))}
      </div>

      {result.killSignals.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <h5 className="text-xs font-semibold text-red-700 uppercase mb-1">Kill Signals</h5>
          <ul className="space-y-1">
            {result.killSignals.map((signal, i) => (
              <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                <span className="shrink-0">!</span> {signal}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
