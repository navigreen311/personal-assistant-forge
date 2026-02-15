'use client';

import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import type { TimeSavedAggregate } from '../types';

interface Props {
  aggregate: TimeSavedAggregate;
}

export default function TimeSavedDisplay({ aggregate }: Props) {
  const hours = Math.floor(aggregate.totalMinutesSaved / 60);
  const minutes = aggregate.totalMinutesSaved % 60;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-medium uppercase text-gray-400">
        Time Saved by AI
      </h3>
      <div className="flex items-end gap-4">
        <div>
          <p className="text-4xl font-bold text-green-600">
            {hours}h {minutes}m
          </p>
          <p className="text-sm text-gray-500">total minutes saved</p>
        </div>
        <div className="h-12 w-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={aggregate.dailyTrend}>
              <Line
                type="monotone"
                dataKey="minutes"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {aggregate.bySource.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {aggregate.bySource.map((s) => (
            <div key={s.source} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{s.source}</span>
              <span className="font-medium text-gray-900">{s.minutes} min</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
