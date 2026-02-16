'use client';

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

// Demo data for initial render
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

const demoProductivity: ProductivityScore = {
  userId: 'demo',
  date: '2026-02-15',
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

const demoTimeAudit: TimeAuditReport = {
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

const demoGoals: GoalDefinition[] = [
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

const demoCosts: LLMCostDashboard = {
  entityId: 'demo', period: '2026-02', totalCostUsd: 187.45,
  byFeature: [
    { feature: 'Email Drafts', cost: 72.30, tokenCount: 7230000 },
    { feature: 'Triage', cost: 45.10, tokenCount: 4510000 },
    { feature: 'Research', cost: 38.25, tokenCount: 3825000 },
    { feature: 'Automation', cost: 31.80, tokenCount: 3180000 },
  ],
  budgetCapUsd: 500, percentUsed: 37.49, projectedMonthEnd: 374.90, alerts: [],
};

const demoCalls: CallAnalytics = {
  entityId: 'demo', period: '2026-02', totalCalls: 156,
  connectRate: 68, averageDuration: 420, sentimentAverage: 0.45,
  outcomeDistribution: { CONNECTED: 106, VOICEMAIL: 25, NO_ANSWER: 15, CALLBACK_REQUESTED: 10 },
  roiPerCallType: [
    { callType: 'OUTBOUND', averageRevenue: 125, averageCost: 42, roi: 198 },
    { callType: 'INBOUND', averageRevenue: 85, averageCost: 35, roi: 143 },
  ],
  insights: [],
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Hero Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <TimeSavedDisplay aggregate={demoTimeSaved} />
        <ProductivityScoreCard score={demoProductivity} />
      </div>

      {/* Time Audit Row */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <TimeAuditChart report={demoTimeAudit} />
        </div>
        <DriftAlertBanner alerts={demoTimeAudit.alerts} />
      </div>

      {/* Goals Row */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Active Goals</h2>
        <GoalList goals={demoGoals} />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <LLMCostChart dashboard={demoCosts} />
        <CallAnalyticsPanel analytics={demoCalls} />
      </div>
    </div>
  );
}
