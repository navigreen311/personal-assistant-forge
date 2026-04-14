'use client';

import { useState, useEffect } from 'react';
import { useShadowPageMap } from '@/hooks/useShadowPageMap';
import DashboardHeader from '@/modules/dashboard/components/DashboardHeader';
import DailyTop3Card from '@/modules/dashboard/components/DailyTop3Card';
import { TriageQueueCard } from '@/modules/dashboard/components/TriageQueueCard';
import ActivityFeed from '@/modules/dashboard/components/ActivityFeed';
import TodaySchedule from '@/modules/dashboard/components/TodaySchedule';
import FollowUpTracker from '@/modules/dashboard/components/FollowUpTracker';
import QuickStats from '@/modules/dashboard/components/QuickStats';
import type { DashboardData } from '@/modules/dashboard/types';

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useShadowPageMap({
    pageId: 'dashboard',
    title: 'Dashboard',
    description: 'Daily briefing, priority tasks, triage queue, schedule',
    visibleObjects: [],
    availableActions: [
      { id: 'morning_briefing', label: 'Morning briefing', voiceTriggers: ['briefing', 'morning update'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
      { id: 'show_priorities', label: "Today's priorities", voiceTriggers: ['priorities', 'top 3'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
    ],
    activeFilters: {},
    activeEntity: null,
  });

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) {
          throw new Error(`Failed to fetch dashboard data: ${res.statusText}`);
        }
        const json = await res.json();
        setDashboardData(json.data ?? json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">Failed to load dashboard</p>
          <p className="text-xs text-gray-500">{error ?? 'No data available. Please try again.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen p-6 space-y-6">
      {/* Header */}
      <DashboardHeader
        userName={dashboardData.greeting.name}
        timeOfDay={dashboardData.greeting.timeOfDay}
        timeSavedThisWeek={dashboardData.stats.timeSavedThisWeek}
      />

      {/* Two-column grid: left 60% (lg:col-span-3), right 40% (lg:col-span-2) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-6">
          <DailyTop3Card tasks={dashboardData.topTasks} />
          <TriageQueueCard items={dashboardData.triageQueue} />
          <ActivityFeed activities={dashboardData.activityFeed} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          <TodaySchedule events={dashboardData.todaySchedule} />
          <FollowUpTracker followUps={dashboardData.followUps} />
          <QuickStats stats={dashboardData.stats} />
        </div>
      </div>
    </div>
  );
}
