'use client';

import type { CoachingRecommendation } from '../types';

interface Props {
  recommendation: CoachingRecommendation;
  onApply: () => void;
  onDismiss: () => void;
}

const PRIORITY_COLORS = {
  HIGH: 'border-red-200 bg-red-50',
  MEDIUM: 'border-yellow-200 bg-yellow-50',
  LOW: 'border-gray-200 bg-gray-50',
} as const;

const TYPE_LABELS = {
  FEATURE_DISCOVERY: 'New Feature',
  OPTIMIZATION: 'Optimization',
  AUTOMATION: 'Automation',
  HABIT: 'Good Habit',
} as const;

export default function CoachingCard({ recommendation, onApply, onDismiss }: Props) {
  return (
    <div className={`rounded-lg border p-4 ${PRIORITY_COLORS[recommendation.priority]}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase">
            {TYPE_LABELS[recommendation.type]}
          </span>
          <h4 className="font-medium text-gray-900 mt-0.5">{recommendation.title}</h4>
        </div>
        <span className="text-sm font-medium text-green-600 whitespace-nowrap">
          +{recommendation.estimatedImpactMinutes}m
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-3">{recommendation.description}</p>

      <div className="flex items-center gap-2">
        {recommendation.oneClickAction && (
          <button
            onClick={onApply}
            className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors"
          >
            Apply Now
          </button>
        )}
        <button
          onClick={onDismiss}
          className="text-gray-500 text-sm px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
