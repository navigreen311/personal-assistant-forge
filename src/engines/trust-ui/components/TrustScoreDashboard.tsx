'use client';

import { useEffect, useState } from 'react';
import type { TrustScoreBreakdown } from '../types';
import TrustScoreCard from './TrustScoreCard';

interface TrustScoreDashboardProps {
  userId: string;
}

export { TrustScoreDashboard };

export default function TrustScoreDashboard({ userId }: TrustScoreDashboardProps) {
  const [scores, setScores] = useState<TrustScoreBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchScores() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/trust-scores?userId=${encodeURIComponent(userId)}`
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch trust scores: ${res.status}`);
        }

        const data = await res.json();

        if (!cancelled) {
          setScores(data.data ?? data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchScores();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Compute aggregate stats
  const averageScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
        )
      : 0;

  const improvingCount = scores.filter((s) => s.trend === 'IMPROVING').length;
  const decliningCount = scores.filter((s) => s.trend === 'DECLINING').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading trust scores...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-800 dark:text-red-400">
          Error loading trust scores
        </p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with aggregate stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Trust Score Overview
        </h2>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Average:
            </span>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {averageScore}
            </span>
          </div>
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-green-600 dark:text-green-400">{'\u2191'}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {improvingCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-red-600 dark:text-red-400">{'\u2193'}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {decliningCount}
            </span>
          </div>
        </div>
      </div>

      {/* Score cards grid */}
      {scores.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No trust scores available yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scores.map((score) => (
            <TrustScoreCard key={score.domain} score={score} />
          ))}
        </div>
      )}
    </div>
  );
}
