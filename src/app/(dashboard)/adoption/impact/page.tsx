'use client';

import { useState, useEffect } from 'react';
import TimeSavedCounter from '@/engines/adoption/components/TimeSavedCounter';
import TimeSavedChart from '@/engines/adoption/components/TimeSavedChart';
import type { TimeSavedSummary } from '@/engines/adoption/types';

const DEMO_USER_ID = 'demo-user';

export default function ImpactPage() {
  const [summary, setSummary] = useState<TimeSavedSummary | null>(null);

  useEffect(() => {
    async function loadData() {
      const { getTimeSavedSummary } = await import('@/engines/adoption/time-saved-service');
      const data = await getTimeSavedSummary(DEMO_USER_ID, 30);
      setSummary(data);
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Impact Dashboard</h2>
        <p className="text-gray-500 mt-1">
          Track how much time your AI assistant saves you.
        </p>
      </div>

      <TimeSavedCounter userId={DEMO_USER_ID} />

      {summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Total Hours Saved</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalHoursSaved}h</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Current Streak</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{summary.streak} days</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Projected Monthly Savings</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{Math.round(summary.projectedMonthlySavings / 60)}h</p>
            </div>
          </div>

          <TimeSavedChart data={summary.byDay} />

          {/* Category breakdown */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Saved by Category</h3>
            {Object.keys(summary.byCategory).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(summary.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, minutes]) => {
                    const percent = summary.totalMinutesSaved > 0
                      ? Math.round((minutes / summary.totalMinutesSaved) * 100)
                      : 0;
                    return (
                      <div key={category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 capitalize">{category}</span>
                          <span className="text-gray-500">{minutes}m ({percent}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No data yet. Start using AI features to track time saved.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
