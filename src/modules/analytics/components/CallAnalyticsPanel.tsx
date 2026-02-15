'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { CallAnalytics } from '../types';

interface Props {
  analytics: CallAnalytics;
}

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#06b6d4', '#ec4899'];

export default function CallAnalyticsPanel({ analytics }: Props) {
  const outcomeData = Object.entries(analytics.outcomeDistribution).map(
    ([name, value]) => ({ name, value })
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Call Analytics
      </h3>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {analytics.totalCalls}
          </p>
          <p className="text-xs text-gray-400">Total Calls</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">
            {analytics.connectRate}%
          </p>
          <p className="text-xs text-gray-400">Connect Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">
            {Math.round(analytics.averageDuration / 60)}m
          </p>
          <p className="text-xs text-gray-400">Avg Duration</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600">
            {analytics.sentimentAverage.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">Avg Sentiment</p>
        </div>
      </div>

      <div className="flex items-start gap-6">
        <div className="w-40">
          <p className="mb-1 text-xs font-medium uppercase text-gray-400">
            Outcomes
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={outcomeData}
                cx="50%"
                cy="50%"
                outerRadius={60}
                dataKey="value"
                label={false}
              >
                {outcomeData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {analytics.roiPerCallType.length > 0 && (
          <div className="flex-1">
            <p className="mb-2 text-xs font-medium uppercase text-gray-400">
              ROI by Type
            </p>
            <div className="space-y-2">
              {analytics.roiPerCallType.map((r) => (
                <div
                  key={r.callType}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600">{r.callType}</span>
                  <span
                    className={`font-medium ${
                      r.roi > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {r.roi}% ROI
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
