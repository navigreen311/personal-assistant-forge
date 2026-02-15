'use client';

import { useState, useEffect } from 'react';
import ActivationChecklist from '@/engines/adoption/components/ActivationChecklist';
import TimeSavedCounter from '@/engines/adoption/components/TimeSavedCounter';
import AhaMomentTracker from '@/engines/adoption/components/AhaMomentTracker';
import CoachingCard from '@/engines/adoption/components/CoachingCard';
import PlaybookLibrary from '@/engines/adoption/components/PlaybookLibrary';
import type { ActivationChecklist as ChecklistType, CoachingRecommendation, Playbook } from '@/engines/adoption/types';

const DEMO_USER_ID = 'demo-user';

export default function AdoptionJourneyPage() {
  const [checklist, setChecklist] = useState<ChecklistType | null>(null);
  const [recommendations, setRecommendations] = useState<CoachingRecommendation[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  useEffect(() => {
    async function loadData() {
      const { getChecklist } = await import('@/engines/adoption/activation-service');
      const { generateRecommendations } = await import('@/engines/adoption/coaching-service');
      const { getDefaultPlaybooks } = await import('@/engines/adoption/playbook-service');

      const [cl, recs] = await Promise.all([
        getChecklist(DEMO_USER_ID),
        generateRecommendations(DEMO_USER_ID),
      ]);

      setChecklist(cl);
      setRecommendations(recs.slice(0, 2));
      setPlaybooks(getDefaultPlaybooks().slice(0, 3));
    }
    loadData();
  }, []);

  const handleApplyRec = async (recId: string) => {
    const { applyRecommendation } = await import('@/engines/adoption/coaching-service');
    await applyRecommendation(DEMO_USER_ID, recId);
    setRecommendations(prev => prev.filter(r => r.id !== recId));
  };

  const handleDismissRec = async (recId: string) => {
    const { dismissRecommendation } = await import('@/engines/adoption/coaching-service');
    await dismissRecommendation(DEMO_USER_ID, recId);
    setRecommendations(prev => prev.filter(r => r.id !== recId));
  };

  return (
    <div className="space-y-6">
      {/* Top: Time Saved Counter */}
      <TimeSavedCounter userId={DEMO_USER_ID} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Activation Checklist */}
        <div className="lg:col-span-2">
          {checklist && <ActivationChecklist checklist={checklist} />}
        </div>

        {/* Right column: Aha Moments + Coaching */}
        <div className="space-y-6">
          <AhaMomentTracker userId={DEMO_USER_ID} />

          {recommendations.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Wins</h3>
              <div className="space-y-3">
                {recommendations.map(rec => (
                  <CoachingCard
                    key={rec.id}
                    recommendation={rec}
                    onApply={() => handleApplyRec(rec.id)}
                    onDismiss={() => handleDismissRec(rec.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Playbook Library preview */}
      {playbooks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Featured Playbooks</h3>
          <PlaybookLibrary playbooks={playbooks} />
        </div>
      )}
    </div>
  );
}
