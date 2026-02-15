'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { HabitCorrelation } from '../types';

interface Props {
  correlations: HabitCorrelation[];
}

export default function HabitCorrelationChart({ correlations }: Props) {
  const data = correlations.map((c) => ({
    habitName: c.habitName,
    metric: c.metric.replace('_', ' '),
    coefficient: c.correlationCoefficient,
    description: c.description,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Habit-Metric Correlations
      </h3>
      {data.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" type="category" name="Metric" />
              <YAxis
                dataKey="coefficient"
                domain={[-1, 1]}
                name="Correlation"
              />
              <Tooltip
                formatter={(value: number) => value.toFixed(3)}
                labelFormatter={(label: string) => `Metric: ${label}`}
              />
              <Scatter data={data} fill="#8b5cf6" />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1">
            {correlations.map((c, i) => (
              <p key={i} className="text-sm text-gray-600">
                <span
                  className={`font-medium ${
                    c.correlationCoefficient > 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  r={c.correlationCoefficient.toFixed(3)}
                </span>{' '}
                — {c.description}
              </p>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">
          Not enough data for correlation analysis. Keep tracking for at least 5 days.
        </p>
      )}
    </div>
  );
}
