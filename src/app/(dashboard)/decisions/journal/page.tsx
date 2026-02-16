'use client';

import { useState, useEffect, useCallback } from 'react';
import JournalEntryCard from '@/modules/decisions/components/JournalEntryCard';
import JournalReviewForm from '@/modules/decisions/components/JournalReviewForm';
import type { JournalEntry, DecisionAccuracy } from '@/modules/decisions/types';

export default function DecisionJournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [upcomingReviews, setUpcomingReviews] = useState<JournalEntry[]>([]);
  const [accuracy, setAccuracy] = useState<DecisionAccuracy | null>(null);
  const [entityId, setEntityId] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const [entriesRes, upcomingRes] = await Promise.all([
        fetch(`/api/decisions/journal?entityId=${encodeURIComponent(entityId)}&page=1&pageSize=50`),
        fetch(`/api/decisions/journal?entityId=${encodeURIComponent(entityId)}&upcomingDays=30`),
      ]);

      const entriesJson = await entriesRes.json();
      const upcomingJson = await upcomingRes.json();

      if (entriesJson.success) {
        setEntries(entriesJson.data ?? []);

        // Compute accuracy from entries client-side
        const reviewed = (entriesJson.data ?? []).filter(
          (e: JournalEntry) => e.status !== 'PENDING_REVIEW'
        );
        const correct = reviewed.filter(
          (e: JournalEntry) => e.status === 'REVIEWED_CORRECT'
        ).length;
        const incorrect = reviewed.filter(
          (e: JournalEntry) => e.status === 'REVIEWED_INCORRECT'
        ).length;
        const mixed = reviewed.filter(
          (e: JournalEntry) => e.status === 'REVIEWED_MIXED'
        ).length;
        const total = reviewed.length;

        setAccuracy({
          total,
          correct,
          incorrect,
          mixed,
          accuracy: total > 0 ? Math.round((correct / total) * 100) / 100 : 0,
        });
      }

      if (upcomingJson.success) {
        setUpcomingReviews(upcomingJson.data ?? []);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReview = async (data: {
    actualOutcomes: string[];
    status: string;
    lessonsLearned: string;
  }) => {
    if (!reviewingId) return;
    try {
      const res = await fetch(`/api/decisions/journal/${reviewingId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setReviewingId(null);
        fetchData();
      }
    } catch {
      // silently handle
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Decision Journal</h1>

      <div className="mb-6">
        <input
          type="text"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="Enter Entity ID..."
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {accuracy && accuracy.total > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Decision Accuracy</h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{accuracy.total}</div>
              <div className="text-xs text-gray-500">Total Reviewed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{accuracy.correct}</div>
              <div className="text-xs text-gray-500">Correct</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{accuracy.incorrect}</div>
              <div className="text-xs text-gray-500">Incorrect</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{accuracy.mixed}</div>
              <div className="text-xs text-gray-500">Mixed</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-200">
              {accuracy.total > 0 && (
                <>
                  <div
                    className="bg-green-500"
                    style={{ width: `${(accuracy.correct / accuracy.total) * 100}%` }}
                  />
                  <div
                    className="bg-red-500"
                    style={{ width: `${(accuracy.incorrect / accuracy.total) * 100}%` }}
                  />
                  <div
                    className="bg-purple-500"
                    style={{ width: `${(accuracy.mixed / accuracy.total) * 100}%` }}
                  />
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 text-center">
              Accuracy: {Math.round(accuracy.accuracy * 100)}%
            </p>
          </div>
        </div>
      )}

      {upcomingReviews.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Upcoming Reviews ({upcomingReviews.length})
          </h2>
          <div className="space-y-2">
            {upcomingReviews.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onClick={() => setReviewingId(entry.id)}
              />
            ))}
          </div>
        </div>
      )}

      {reviewingId && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Review Entry</h2>
          <JournalReviewForm
            entryId={reviewingId}
            onSubmit={handleReview}
            onCancel={() => setReviewingId(null)}
          />
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!loading && entries.length === 0 && entityId && (
        <p className="text-sm text-gray-500">No journal entries found.</p>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <JournalEntryCard
            key={entry.id}
            entry={entry}
            onClick={() => setReviewingId(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}
