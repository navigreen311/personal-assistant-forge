'use client';

import { useState, useEffect } from 'react';
import type { AhaMoment } from '../types';

interface Props {
  userId: string;
}

interface AhaProgress {
  completed: AhaMoment[];
  next: AhaMoment | null;
  guidanceMessage: string;
}

export default function AhaMomentTracker({ userId }: Props) {
  const [progress, setProgress] = useState<AhaProgress | null>(null);
  const [allMoments, setAllMoments] = useState<AhaMoment[]>([]);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const { checkAhaMomentProgress, getAhaMoments } = await import('../aha-moment-service');
        const data = await checkAhaMomentProgress(userId);
        setProgress(data);
        setAllMoments(getAhaMoments());
      } catch {
        // Handle error silently
      }
    }
    fetchProgress();
  }, [userId]);

  if (!progress) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-20 bg-gray-200 rounded" />
      </div>
    );
  }

  const completedActions = new Set(progress.completed.map(m => m.action));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Milestones</h3>
      <p className="text-sm text-gray-500 mb-4">{progress.guidanceMessage}</p>

      <div className="space-y-3">
        {allMoments.map((moment, index) => {
          const isCompleted = completedActions.has(moment.action);
          const isNext = progress.next?.action === moment.action;

          return (
            <div
              key={moment.action}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                isCompleted ? 'bg-green-50' : isNext ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isCompleted ? 'bg-green-500 text-white' : isNext ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${isCompleted ? 'text-green-800' : 'text-gray-900'}`}>
                  {moment.description}
                </p>
                <p className="text-xs text-gray-500">
                  Target: Day {moment.targetDay} · Retention impact: {Math.round(moment.retentionCorrelation * 100)}%
                </p>
              </div>
              {isNext && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  Next
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
