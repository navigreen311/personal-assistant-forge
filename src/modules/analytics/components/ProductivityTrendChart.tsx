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
import type { ProductivityScore } from '../types';

interface Props {
  scores: ProductivityScore[];
}

export default function ProductivityTrendChart({ scores }: Props) {
  const data = scores.map((s) => ({
    date: s.date,
    score: s.overallScore,
    highPri: s.dimensions.highPriorityCompletion,
    focus: s.dimensions.focusTimeAchieved,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Productivity Trend
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} name="Overall" />
          <Line type="monotone" dataKey="highPri" stroke="#22c55e" strokeWidth={1} strokeDasharray="3 3" name="High Priority" />
          <Line type="monotone" dataKey="focus" stroke="#a855f7" strokeWidth={1} strokeDasharray="3 3" name="Focus Time" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
