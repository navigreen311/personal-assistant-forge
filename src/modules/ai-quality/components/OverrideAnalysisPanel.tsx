'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { OverrideAnalysis } from '../types';

interface Props {
  analysis: OverrideAnalysis;
}

const trendColors = {
  IMPROVING: 'text-green-600',
  STABLE: 'text-gray-600',
  WORSENING: 'text-red-600',
};

export default function OverrideAnalysisPanel({ analysis }: Props) {
  const reasonData = Object.entries(analysis.byReason).map(
    ([reason, count]) => ({ reason: reason.replace('_', ' '), count })
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Override Analysis
      </h3>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {analysis.totalOverrides}
          </p>
          <p className="text-xs text-gray-400">Total Overrides</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {(analysis.overrideRate * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-400">Override Rate</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${trendColors[analysis.trend]}`}>
            {analysis.trend}
          </p>
          <p className="text-xs text-gray-400">Trend</p>
        </div>
      </div>

      {reasonData.length > 0 && (
        <>
          <p className="mb-2 text-xs font-medium uppercase text-gray-400">
            By Reason
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={reasonData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="reason" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {analysis.topPatterns.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase text-gray-400">
            Top Patterns
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-gray-500">Pattern</th>
                <th className="pb-2 text-right text-gray-500">Count</th>
                <th className="pb-2 text-left text-gray-500 pl-4">
                  Suggested Fix
                </th>
              </tr>
            </thead>
            <tbody>
              {analysis.topPatterns.map((p, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 font-medium text-gray-700">
                    {p.pattern}
                  </td>
                  <td className="py-1.5 text-right">{p.count}</td>
                  <td className="py-1.5 pl-4 text-gray-500">
                    {p.suggestedFix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
