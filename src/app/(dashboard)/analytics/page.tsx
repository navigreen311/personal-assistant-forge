'use client';

import { useEffect, useState } from 'react';
import TimeSavedDisplay from '@/modules/analytics/components/TimeSavedDisplay';
import ProductivityScoreCard from '@/modules/analytics/components/ProductivityScoreCard';
import TimeAuditChart from '@/modules/analytics/components/TimeAuditChart';
import DriftAlertBanner from '@/modules/analytics/components/DriftAlertBanner';
import GoalList from '@/modules/analytics/components/GoalList';
import LLMCostChart from '@/modules/analytics/components/LLMCostChart';
import CallAnalyticsPanel from '@/modules/analytics/components/CallAnalyticsPanel';
import type {
  TimeSavedAggregate,
  ProductivityScore,
  TimeAuditReport,
  GoalDefinition,
  LLMCostDashboard,
  CallAnalytics,
} from '@/modules/analytics/types';

// Fallback demo data for time-saved if API fetch fails
const demoTimeSaved: TimeSavedAggregate = {
  userId: 'demo',
  totalMinutesSaved: 847,
  bySource: [
    { source: 'Email Drafts', minutes: 320 },
    { source: 'Task Automation', minutes: 280 },
    { source: 'Meeting Prep', minutes: 147 },
    { source: 'Research', minutes: 100 },
  ],
  dailyTrend: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-02-${String(i + 1).padStart(2, '0')}`,
    minutes: 40 + Math.floor(Math.random() * 30),
  })),
};

export default function AnalyticsPage() {
  const [timeSaved, setTimeSaved] = useState<TimeSavedAggregate | null>(null);
  const [productivity, setProductivity] = useState<ProductivityScore | null>(null);
  const [timeAudit, setTimeAudit] = useState<TimeAuditReport | null>(null);
  const [goals, setGoals] = useState<GoalDefinition[] | null>(null);
  const [costs, setCosts] = useState<LLMCostDashboard | null>(null);
  const [calls, setCalls] = useState<CallAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const results = await Promise.allSettled([
          fetch('/api/analytics/productivity').then((r) => r.json()),
          fetch(
            `/api/analytics/time-audit?start=${thirtyDaysAgo.toISOString()}&end=${now.toISOString()}`
          ).then((r) => r.json()),
          fetch('/api/analytics/goals').then((r) => r.json()),
          fetch(
            `/api/analytics/llm-costs?entityId=default&period=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          ).then((r) => r.json()),
          fetch(
            `/api/analytics/call-analytics?entityId=default&start=${thirtyDaysAgo.toISOString()}&end=${now.toISOString()}`
          ).then((r) => r.json()),
          fetch('/api/analytics/time-saved').then((r) => r.json()),
        ]);

        if (results[0].status === 'fulfilled' && results[0].value?.data) {
          setProductivity(results[0].value.data);
        }
        if (results[1].status === 'fulfilled' && results[1].value?.data) {
          setTimeAudit(results[1].value.data);
        }
        if (results[2].status === 'fulfilled' && results[2].value?.data) {
          setGoals(results[2].value.data);
        }
        if (results[3].status === 'fulfilled' && results[3].value?.data) {
          setCosts(results[3].value.data);
        }
        if (results[4].status === 'fulfilled' && results[4].value?.data) {
          setCalls(results[4].value.data);
        }
        if (results[5].status === 'fulfilled' && results[5].value?.data) {
          setTimeSaved(results[5].value.data);
        }
      } catch {
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fallback demo data for sections that fail to load
  const timeSavedData: TimeSavedAggregate = timeSaved ?? demoTimeSaved;

  const productivityData: ProductivityScore = productivity ?? {
    userId: 'demo',
    date: new Date().toISOString().split('T')[0],
    overallScore: 78,
    dimensions: {
      highPriorityCompletion: 85,
      focusTimeAchieved: 72,
      goalProgress: 68,
      meetingEfficiency: 90,
      communicationSpeed: 80,
    },
    trend: 'IMPROVING',
  };

  const timeAuditData: TimeAuditReport = timeAudit ?? {
    userId: 'demo',
    periodStart: new Date('2026-02-10'),
    periodEnd: new Date('2026-02-15'),
    entries: [
      { date: '2026-02-15', category: 'deep_work', intendedMinutes: 240, actualMinutes: 180, driftMinutes: -60, driftPercent: 25 },
      { date: '2026-02-15', category: 'meetings', intendedMinutes: 120, actualMinutes: 180, driftMinutes: 60, driftPercent: 50 },
      { date: '2026-02-15', category: 'email', intendedMinutes: 60, actualMinutes: 75, driftMinutes: 15, driftPercent: 25 },
      { date: '2026-02-15', category: 'admin', intendedMinutes: 60, actualMinutes: 45, driftMinutes: -15, driftPercent: 25 },
    ],
    totalDriftMinutes: 150,
    worstDriftCategory: 'meetings',
    alerts: [
      { category: 'meetings', message: 'Critical drift in meetings: 50% deviation from plan', severity: 'CRITICAL', suggestedAction: 'Review and restructure meetings time allocation.' },
      { category: 'deep_work', message: 'Warning: deep_work drifted 25% from intended allocation', severity: 'WARNING', suggestedAction: 'Monitor deep_work time more closely.' },
    ],
  };

  const goalsData: GoalDefinition[] = goals ?? [
    {
      id: '1', userId: 'demo', title: 'Ship v2.0 Release', framework: 'OKR',
      targetValue: 100, currentValue: 65, unit: '%', milestones: [],
      startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'),
      status: 'ON_TRACK', autoProgress: true, linkedTaskIds: [], linkedWorkflowIds: [],
    },
    {
      id: '2', userId: 'demo', title: 'Reduce response time to < 2h', framework: 'SMART',
      targetValue: 120, currentValue: 85, unit: 'min', milestones: [],
      startDate: new Date('2026-02-01'), endDate: new Date('2026-02-28'),
      status: 'AT_RISK', autoProgress: false, linkedTaskIds: [], linkedWorkflowIds: [],
    },
  ];

  const costsData: LLMCostDashboard = costs ?? {
    entityId: 'demo', period: '2026-02', totalCostUsd: 187.45,
    byFeature: [
      { feature: 'Email Drafts', cost: 72.30, tokenCount: 7230000 },
      { feature: 'Triage', cost: 45.10, tokenCount: 4510000 },
      { feature: 'Research', cost: 38.25, tokenCount: 3825000 },
      { feature: 'Automation', cost: 31.80, tokenCount: 3180000 },
    ],
    budgetCapUsd: 500, percentUsed: 37.49, projectedMonthEnd: 374.90, alerts: [],
  };

  const callsData: CallAnalytics = calls ?? {
    entityId: 'demo', period: '2026-02', totalCalls: 156,
    connectRate: 68, averageDuration: 420, sentimentAverage: 0.45,
    outcomeDistribution: { CONNECTED: 106, VOICEMAIL: 25, NO_ANSWER: 15, CALLBACK_REQUESTED: 10 },
    roiPerCallType: [
      { callType: 'OUTBOUND', averageRevenue: 125, averageCost: 42, roi: 198 },
      { callType: 'INBOUND', averageRevenue: 85, averageCost: 35, roi: 143 },
    ],
    insights: [],
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <TimeSavedDisplay aggregate={timeSavedData} />
        <ProductivityScoreCard score={productivityData} />
      </div>

      {/* Time Audit Row */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <TimeAuditChart report={timeAuditData} />
        </div>
        <DriftAlertBanner alerts={timeAuditData.alerts} />
      </div>

      {/* Goals Row */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Active Goals</h2>
        <GoalList goals={goalsData} />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <LLMCostChart dashboard={costsData} />
        <CallAnalyticsPanel analytics={callsData} />
      </div>
    </div>
  );
}
