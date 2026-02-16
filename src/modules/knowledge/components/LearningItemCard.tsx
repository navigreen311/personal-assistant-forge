'use client';

import type { LearningItem } from '@/modules/knowledge/types';
import LearningProgressBar from './LearningProgressBar';

interface LearningItemCardProps {
  item: LearningItem;
  onClick?: (item: LearningItem) => void;
}

const statusColors: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  ABANDONED: 'bg-red-100 text-red-700',
};

export default function LearningItemCard({ item, onClick }: LearningItemCardProps) {
  return (
    <div
      onClick={() => onClick?.(item)}
      className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
          {item.type}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[item.status] || ''}`}>
          {item.status}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2 truncate">{item.title}</h3>
      {item.status === 'IN_PROGRESS' && (
        <LearningProgressBar progress={item.progress} />
      )}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>{item.reviewCount} reviews</span>
        {item.nextReviewDate && (
          <span>Next review: {new Date(item.nextReviewDate).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}
