'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AccuracyScorecard } from '../types';

interface Props {
  history: AccuracyScorecard[];
}

const gradeToNum: Record<string, number> = {
  A: 95,
  B: 85,
  C: 75,
  D: 65,
  F: 50,
};

export default function ScorecardTrend({ history }: Props) {
  const data = history.map((s) => ({
    period: s.period,
    grade: gradeToNum[s.overallGrade] ?? 50,
    triage: s.triageAccuracy,
    drafts: s.draftApprovalRate,
    automation: s.automationSuccessRate,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Scorecard History
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="grade"
            stroke="#3b82f6"
            strokeWidth={2}
            name="Overall Grade"
          />
          <Line
            type="monotone"
            dataKey="triage"
            stroke="#22c55e"
            strokeWidth={1}
            strokeDasharray="3 3"
            name="Triage"
          />
          <Line
            type="monotone"
            dataKey="automation"
            stroke="#a855f7"
            strokeWidth={1}
            strokeDasharray="3 3"
            name="Automation"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
