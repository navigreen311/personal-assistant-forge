'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AIAccuracyMetrics } from '../types';

interface Props {
  metrics: AIAccuracyMetrics[];
}

export default function AIAccuracyChart({ metrics }: Props) {
  const data = metrics.map((m) => ({
    period: m.period,
    triage: m.triageAccuracy,
    draft: m.draftApprovalRate,
    prediction: m.predictionAccuracy,
    automation: m.automationSuccess,
    overall: m.overallScore,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        AI Accuracy Trend
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="overall" stroke="#3b82f6" strokeWidth={2} name="Overall" />
          <Line type="monotone" dataKey="triage" stroke="#22c55e" strokeWidth={1} name="Triage" />
          <Line type="monotone" dataKey="draft" stroke="#a855f7" strokeWidth={1} name="Drafts" />
          <Line type="monotone" dataKey="prediction" stroke="#f59e0b" strokeWidth={1} name="Predictions" />
          <Line type="monotone" dataKey="automation" stroke="#ef4444" strokeWidth={1} name="Automation" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
