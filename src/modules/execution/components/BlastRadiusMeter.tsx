'use client';

import { useState } from 'react';
import type { BlastRadiusScore, BlastRadiusFactor } from '@/modules/execution/types';
import type { BlastRadius } from '@/shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlastRadiusMeterProps {
  score: BlastRadiusScore;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_META: Record<BlastRadius, { label: string; color: string; position: number }> = {
  LOW: { label: 'LOW', color: 'text-emerald-600 dark:text-emerald-400', position: 15 },
  MEDIUM: { label: 'MEDIUM', color: 'text-amber-500 dark:text-amber-400', position: 40 },
  HIGH: { label: 'HIGH', color: 'text-orange-600 dark:text-orange-400', position: 65 },
  CRITICAL: { label: 'CRITICAL', color: 'text-red-600 dark:text-red-400', position: 90 },
};

/**
 * Convert `totalScore` (expected 0-100) to a clamped percentage for the
 * position indicator. Falls back to the level-based default if the score is 0.
 */
function scoreToPercent(totalScore: number, overall: BlastRadius): number {
  if (totalScore > 0) return Math.max(0, Math.min(100, totalScore));
  return LEVEL_META[overall].position;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FactorRow({ factor }: { factor: BlastRadiusFactor }) {
  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-700/50">
      <td className="py-1.5 pr-3 text-sm text-zinc-700 dark:text-zinc-300">{factor.name}</td>
      <td className="py-1.5 pr-3 text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {factor.weight.toFixed(2)}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {factor.score.toFixed(1)}
      </td>
      <td className="py-1.5 text-xs text-zinc-500 dark:text-zinc-400">{factor.reason}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BlastRadiusMeter({ score }: BlastRadiusMeterProps) {
  const [expanded, setExpanded] = useState(false);

  const meta = LEVEL_META[score.overall];
  const percent = scoreToPercent(score.totalScore, score.overall);
  const reversibilityPercent = Math.round(score.reversibilityScore * 100);

  return (
    <div className="w-full space-y-3">
      {/* ---- Horizontal bar meter ---- */}
      <div className="relative h-4 w-full overflow-hidden rounded-full">
        {/* Gradient track: green -> yellow -> orange -> red */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(to right, #22c55e 0%, #eab308 33%, #f97316 66%, #ef4444 100%)',
          }}
        />

        {/* Position indicator */}
        <div
          className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full bg-white shadow-md ring-2 ring-zinc-900/30 transition-all duration-300 dark:ring-white/40"
          style={{ left: `${percent}%` }}
        />
      </div>

      {/* ---- Score / label / reversibility ---- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {score.totalScore}
          </span>
          <span className={`text-sm font-semibold uppercase ${meta.color}`}>{meta.label}</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>{reversibilityPercent}% reversible</span>
        </div>
      </div>

      {/* ---- Summary stats ---- */}
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          Affected entities:{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {score.affectedEntitiesCount}
          </span>
        </span>
        <span>
          Affected contacts:{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {score.affectedContactsCount}
          </span>
        </span>
        {score.financialImpact > 0 && (
          <span>
            Financial impact:{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              ${score.financialImpact.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* ---- Recommendation ---- */}
      {score.recommendation && (
        <p className="text-xs italic text-zinc-500 dark:text-zinc-400">{score.recommendation}</p>
      )}

      {/* ---- Expandable factor breakdown ---- */}
      {score.factors.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {expanded ? 'Hide' : 'Show'} factor breakdown ({score.factors.length})
          </button>

          {expanded && (
            <div className="mt-2 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Factor
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Weight
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Score
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {score.factors.map((f) => (
                    <FactorRow key={f.name} factor={f} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
