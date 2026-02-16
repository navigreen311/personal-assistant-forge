'use client';

import type { DecisionBrief } from '@/modules/decisions/types';

interface DecisionBriefCardProps {
  brief: DecisionBrief;
  blastRadius?: string;
  onClick?: () => void;
}

export default function DecisionBriefCard({
  brief,
  blastRadius,
  onClick,
}: DecisionBriefCardProps) {
  const confidencePercent = Math.round(brief.confidenceScore * 100);

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-gray-900 truncate pr-4">
          {brief.title}
        </h3>
        {blastRadius && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${
              blastRadius === 'LOW'
                ? 'bg-green-100 text-green-800'
                : blastRadius === 'MEDIUM'
                  ? 'bg-yellow-100 text-yellow-800'
                  : blastRadius === 'HIGH'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-red-100 text-red-800'
            }`}
          >
            {blastRadius}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-500 line-clamp-2">
        {brief.recommendation}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{confidencePercent}% confidence</span>
        </div>

        <span className="text-xs text-gray-400">
          {new Date(brief.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {brief.options.map((opt) => (
          <span
            key={opt.id}
            className={`text-xs px-2 py-0.5 rounded ${
              opt.strategy === 'CONSERVATIVE'
                ? 'bg-blue-50 text-blue-700'
                : opt.strategy === 'MODERATE'
                  ? 'bg-purple-50 text-purple-700'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {opt.strategy}
          </span>
        ))}
      </div>
    </div>
  );
}
