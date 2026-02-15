'use client';

import { useState } from 'react';
import type { LearningItem } from '@/modules/knowledge/types';

interface ReviewCardProps {
  item: LearningItem;
  onReview: (id: string, quality: number) => void;
}

const qualityLabels = [
  { value: 0, label: 'No recall', color: 'bg-red-500' },
  { value: 1, label: 'Barely', color: 'bg-red-400' },
  { value: 2, label: 'Hard', color: 'bg-orange-400' },
  { value: 3, label: 'Okay', color: 'bg-yellow-400' },
  { value: 4, label: 'Good', color: 'bg-green-400' },
  { value: 5, label: 'Perfect', color: 'bg-green-600' },
];

export default function ReviewCard({ item, onReview }: ReviewCardProps) {
  const [showRating, setShowRating] = useState(false);

  return (
    <div className="p-4 bg-white rounded-lg border border-orange-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
          Due for Review
        </span>
        <span className="text-xs text-gray-500">{item.type}</span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{item.title}</h3>
      {item.keyTakeaways.length > 0 && (
        <ul className="text-xs text-gray-600 mb-3 list-disc list-inside">
          {item.keyTakeaways.slice(0, 3).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      {!showRating ? (
        <button
          onClick={() => setShowRating(true)}
          className="w-full px-3 py-2 bg-orange-500 text-white text-sm font-medium rounded-md hover:bg-orange-600"
        >
          Review Now
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">How well did you recall this?</p>
          <div className="grid grid-cols-3 gap-1">
            {qualityLabels.map(({ value, label, color }) => (
              <button
                key={value}
                onClick={() => onReview(item.id, value)}
                className={`px-2 py-1.5 text-xs text-white rounded ${color} hover:opacity-80`}
              >
                {value}: {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
