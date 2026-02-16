'use client';

import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
} from 'recharts';
import type { ConfidenceScore } from '../types';

interface Props {
  score: ConfidenceScore;
}

export default function ConfidenceGauge({ score }: Props) {
  const percent = Math.round(score.confidence * 100);
  const color =
    score.recommendation === 'AUTO_EXECUTE'
      ? '#22c55e'
      : score.recommendation === 'REVIEW_RECOMMENDED'
        ? '#f59e0b'
        : '#ef4444';

  const data = [{ value: percent, fill: color }];

  const recLabels = {
    AUTO_EXECUTE: 'Auto Execute',
    REVIEW_RECOMMENDED: 'Review Recommended',
    HUMAN_REQUIRED: 'Human Required',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h4 className="mb-2 text-sm font-medium text-gray-700">
        Confidence Score
      </h4>
      <div className="relative h-28 w-28 mx-auto">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar
              dataKey="value"
              cornerRadius={10}
              background={{ fill: '#f3f4f6' }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {percent}%
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-sm font-medium" style={{ color }}>
        {recLabels[score.recommendation]}
      </p>

      {score.factors.length > 0 && (
        <div className="mt-3 space-y-1">
          {score.factors.map((f, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-500">
              <span>{f.factor}</span>
              <span>{(f.value * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
