'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TimeAuditReport } from '../types';

interface Props {
  report: TimeAuditReport;
}

export default function TimeAuditChart({ report }: Props) {
  const data = report.entries.map((entry) => ({
    category: entry.category.replace('_', ' '),
    Intended: entry.intendedMinutes,
    Actual: entry.actualMinutes,
    Drift: entry.driftMinutes,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Time Audit: Intended vs Actual
      </h3>
      <p className="mb-2 text-sm text-gray-500">
        {report.periodStart.toLocaleDateString()} –{' '}
        {report.periodEnd.toLocaleDateString()}
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="Intended" fill="#93c5fd" />
          <Bar dataKey="Actual" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-sm text-gray-600">
        Total drift: <span className="font-medium">{report.totalDriftMinutes} min</span>{' '}
        | Worst category:{' '}
        <span className="font-medium">{report.worstDriftCategory}</span>
      </p>
    </div>
  );
}
