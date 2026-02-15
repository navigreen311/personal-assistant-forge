'use client';

import { useState, useEffect } from 'react';
import CoachingCard from '@/engines/adoption/components/CoachingCard';
import WeeklyReviewPanel from '@/engines/adoption/components/WeeklyReviewPanel';
import type { CoachingRecommendation } from '@/engines/adoption/types';

const DEMO_USER_ID = 'demo-user';

export default function CoachingPage() {
  const [recommendations, setRecommendations] = useState<CoachingRecommendation[]>([]);

  useEffect(() => {
    async function loadRecs() {
      const { generateRecommendations } = await import('@/engines/adoption/coaching-service');
      const recs = await generateRecommendations(DEMO_USER_ID);
      setRecommendations(recs);
    }
    loadRecs();
  }, []);

  const handleApply = async (recId: string) => {
    const { applyRecommendation } = await import('@/engines/adoption/coaching-service');
    await applyRecommendation(DEMO_USER_ID, recId);
    setRecommendations(prev => prev.filter(r => r.id !== recId));
  };

  const handleDismiss = async (recId: string) => {
    const { dismissRecommendation } = await import('@/engines/adoption/coaching-service');
    await dismissRecommendation(DEMO_USER_ID, recId);
    setRecommendations(prev => prev.filter(r => r.id !== recId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">AI Coaching</h2>
        <p className="text-gray-500 mt-1">
          Personalized recommendations to get more value from your AI assistant.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommendations</h3>
          {recommendations.length > 0 ? (
            <div className="space-y-3">
              {recommendations.map(rec => (
                <CoachingCard
                  key={rec.id}
                  recommendation={rec}
                  onApply={() => handleApply(rec.id)}
                  onDismiss={() => handleDismiss(rec.id)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-500">All caught up! No pending recommendations.</p>
            </div>
          )}
        </div>

        <div>
          <WeeklyReviewPanel userId={DEMO_USER_ID} />
        </div>
      </div>
    </div>
  );
}
