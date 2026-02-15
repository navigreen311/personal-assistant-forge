'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { LLMCostDashboard } from '../types';

interface Props {
  dashboard: LLMCostDashboard;
}

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export default function LLMCostChart({ dashboard }: Props) {
  const pieData = dashboard.byFeature.map((f) => ({
    name: f.feature,
    value: f.cost,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">
        LLM Cost Breakdown
      </h3>
      <p className="mb-4 text-sm text-gray-500">{dashboard.period}</p>

      <div className="flex items-start gap-6">
        <div className="w-48">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                dataKey="value"
                label={false}
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Spend</span>
            <span className="font-bold text-gray-900">
              ${dashboard.totalCostUsd.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Budget Cap</span>
            <span className="font-medium">${dashboard.budgetCapUsd}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Used</span>
            <span
              className={`font-medium ${
                dashboard.percentUsed > 80 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {dashboard.percentUsed}%
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Projected Month-End</span>
            <span className="font-medium">
              ${dashboard.projectedMonthEnd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {dashboard.alerts.length > 0 && (
        <div className="mt-4 space-y-1">
          {dashboard.alerts.map((alert, i) => (
            <p key={i} className="text-sm text-red-600">
              {alert}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
