'use client';

import { useState, useEffect } from 'react';
import type { CoachingRecommendation } from '../types';
import CoachingCard from './CoachingCard';

interface Props {
  userId: string;
}

interface WeeklyReview {
  recommendations: CoachingRecommendation[];
  weeklyTimeSaved: number;
  topWin: string;
  improvementArea: string;
}

export default function WeeklyReviewPanel({ userId }: Props) {
  const [review, setReview] = useState<WeeklyReview | null>(null);

  useEffect(() => {
    async function fetchReview() {
      try {
        const { getWeeklyReview } = await import('../coaching-service');
        const data = await getWeeklyReview(userId);
        setReview(data);
      } catch {
        // Handle error silently
      }
    }
    fetchReview();
  }, [userId]);

  if (!review) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  const handleApply = async (recId: string) => {
    const { applyRecommendation } = await import('../coaching-service');
    await applyRecommendation(userId, recId);
  };

  const handleDismiss = async (recId: string) => {
    const { dismissRecommendation } = await import('../coaching-service');
    await dismissRecommendation(userId, recId);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Review</h3>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Time Saved This Week</p>
          <p className="text-2xl font-bold text-blue-900">{review.weeklyTimeSaved}m</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Top Win</p>
          <p className="text-sm text-green-900 mt-1">{review.topWin}</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm font-medium text-gray-700 mb-1">Area for Improvement</p>
        <p className="text-sm text-gray-600">{review.improvementArea}</p>
      </div>

      {review.recommendations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Recommendations</h4>
          <div className="space-y-3">
            {review.recommendations.map((rec) => (
              <CoachingCard
                key={rec.id}
                recommendation={rec}
                onApply={() => handleApply(rec.id)}
                onDismiss={() => handleDismiss(rec.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
