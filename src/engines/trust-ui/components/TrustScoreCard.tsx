'use client';

import type { TrustScoreBreakdown } from '../types';

interface TrustScoreCardProps {
  score: TrustScoreBreakdown;
}

const TREND_DISPLAY: Record<
  TrustScoreBreakdown['trend'],
  { arrow: string; color: string; label: string }
> = {
  IMPROVING: {
    arrow: '\u2191', // up arrow
    color: 'text-green-600 dark:text-green-400',
    label: 'Improving',
  },
  STABLE: {
    arrow: '\u2192', // right arrow
    color: 'text-zinc-500 dark:text-zinc-400',
    label: 'Stable',
  },
  DECLINING: {
    arrow: '\u2193', // down arrow
    color: 'text-red-600 dark:text-red-400',
    label: 'Declining',
  },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function getBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

interface DimensionBarProps {
  label: string;
  value: number;
}

function DimensionBar({ label, value }: DimensionBarProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {value}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${getBarColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function TrustScoreCard({ score }: TrustScoreCardProps) {
  const trend = TREND_DISPLAY[score.trend];
  const scoreColor = getScoreColor(score.overallScore);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {score.domain}
          </h3>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {score.sampleSize} sample{score.sampleSize !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
            {score.overallScore}
          </span>
          <span className={`text-lg ${trend.color}`} title={trend.label}>
            {trend.arrow}
          </span>
        </div>
      </div>

      {/* Dimension breakdown */}
      <div className="flex flex-col gap-2.5">
        <DimensionBar label="Accuracy" value={score.dimensions.accuracy} />
        <DimensionBar label="Transparency" value={score.dimensions.transparency} />
        <DimensionBar label="Reversibility" value={score.dimensions.reversibility} />
        <DimensionBar label="Override Rate" value={score.dimensions.userOverrideRate} />
      </div>

      {/* Trend label */}
      <div className="mt-4 flex items-center gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className={`text-sm font-medium ${trend.color}`}>{trend.arrow}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Trend: {trend.label}
        </span>
      </div>
    </div>
  );
}
