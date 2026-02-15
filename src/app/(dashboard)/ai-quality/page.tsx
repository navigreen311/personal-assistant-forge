'use client';

import AccuracyScorecardCard from '@/modules/ai-quality/components/AccuracyScorecardCard';
import ScorecardTrend from '@/modules/ai-quality/components/ScorecardTrend';
import ConfidenceGauge from '@/modules/ai-quality/components/ConfidenceGauge';
import OverrideAnalysisPanel from '@/modules/ai-quality/components/OverrideAnalysisPanel';
import BiasReportCard from '@/modules/ai-quality/components/BiasReportCard';
import GoldenTestPanel from '@/modules/ai-quality/components/GoldenTestPanel';
import type { AccuracyScorecard, ConfidenceScore, OverrideAnalysis, BiasReport, GoldenTestSuite } from '@/modules/ai-quality/types';

const demoScorecard: AccuracyScorecard = {
  entityId: 'demo', period: '2026-02-W7',
  triageAccuracy: 92, draftApprovalRate: 85,
  missedDeadlineRate: 12, automationSuccessRate: 88,
  overallGrade: 'B',
};

const demoHistory: AccuracyScorecard[] = [
  { ...demoScorecard, period: '2026-02-W4', overallGrade: 'C', triageAccuracy: 78, draftApprovalRate: 72, missedDeadlineRate: 25, automationSuccessRate: 75 },
  { ...demoScorecard, period: '2026-02-W5', overallGrade: 'B', triageAccuracy: 82, draftApprovalRate: 80, missedDeadlineRate: 18, automationSuccessRate: 82 },
  { ...demoScorecard, period: '2026-02-W6', overallGrade: 'B', triageAccuracy: 88, draftApprovalRate: 83, missedDeadlineRate: 15, automationSuccessRate: 85 },
  demoScorecard,
];

const demoConfidence: ConfidenceScore = {
  actionId: 'demo', confidence: 0.82,
  factors: [
    { factor: 'Historical accuracy', weight: 0.4, value: 0.88 },
    { factor: 'Input clarity', weight: 0.3, value: 0.75 },
    { factor: 'Context match', weight: 0.3, value: 0.82 },
  ],
  recommendation: 'REVIEW_RECOMMENDED',
};

const demoOverrides: OverrideAnalysis = {
  totalOverrides: 47, overrideRate: 0.085, trend: 'IMPROVING',
  byReason: { INCORRECT: 15, WRONG_TONE: 12, PREFERENCE: 10, INCOMPLETE: 7, OTHER: 3 },
  topPatterns: [
    { pattern: 'INCORRECT', count: 15, suggestedFix: 'Review training data and model prompts for factual accuracy.' },
    { pattern: 'WRONG_TONE', count: 12, suggestedFix: 'Update tone guidelines in the user/entity preferences.' },
    { pattern: 'PREFERENCE', count: 10, suggestedFix: 'Record user preference patterns for personalization.' },
  ],
};

const demoBias: BiasReport = {
  entityId: 'demo', period: '2026-02', overallBiasScore: 0.18, alerts: [],
  dimensions: [
    { name: 'entity_bias', score: 0.12, description: 'Task completion rates are consistent across entities.', affectedGroups: [] },
    { name: 'contact_bias', score: 0.22, description: 'Response quality is consistent across contacts.', affectedGroups: [] },
    { name: 'channel_bias', score: 0.15, description: 'Accuracy is consistent across channels.', affectedGroups: [] },
    { name: 'time_bias', score: 0.25, description: 'Performance is consistent throughout the day.', affectedGroups: [] },
  ],
};

const demoSuites: GoldenTestSuite[] = [
  { id: '1', name: 'Triage Classification', description: 'Tests for message triage accuracy', testCases: [], passRate: 92, totalRuns: 15, lastRunDate: new Date('2026-02-14') },
  { id: '2', name: 'Draft Quality', description: 'Tests for AI draft generation quality', testCases: [], passRate: 78, totalRuns: 8, lastRunDate: new Date('2026-02-13') },
];

export default function AIQualityPage() {
  return (
    <div className="space-y-6">
      {/* Top: Scorecard + Trend */}
      <div className="grid gap-6 md:grid-cols-2">
        <AccuracyScorecardCard scorecard={demoScorecard} />
        <ScorecardTrend history={demoHistory} />
      </div>

      {/* Middle: Confidence + Overrides */}
      <div className="grid gap-6 md:grid-cols-3">
        <ConfidenceGauge score={demoConfidence} />
        <div className="md:col-span-2">
          <OverrideAnalysisPanel analysis={demoOverrides} />
        </div>
      </div>

      {/* Bottom: Bias + Tests */}
      <div className="grid gap-6 md:grid-cols-2">
        <BiasReportCard report={demoBias} />
        <GoldenTestPanel suites={demoSuites} />
      </div>
    </div>
  );
}
