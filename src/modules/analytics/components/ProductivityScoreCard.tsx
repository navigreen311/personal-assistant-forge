'use client';

import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
} from 'recharts';
import type { ProductivityScore } from '../types';

interface Props {
  score: ProductivityScore;
}

export default function ProductivityScoreCard({ score }: Props) {
  const data = [
    { name: 'Score', value: score.overallScore, fill: getScoreColor(score.overallScore) },
  ];

  const dimensions = [
    { label: 'High Priority', value: score.dimensions.highPriorityCompletion, weight: '30%' },
    { label: 'Focus Time', value: score.dimensions.focusTimeAchieved, weight: '25%' },
    { label: 'Goal Progress', value: score.dimensions.goalProgress, weight: '20%' },
    { label: 'Meeting Efficiency', value: score.dimensions.meetingEfficiency, weight: '15%' },
    { label: 'Communication', value: score.dimensions.communicationSpeed, weight: '10%' },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">
        Productivity Score
      </h3>
      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32">
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
            <span className="text-3xl font-bold text-gray-900">
              {score.overallScore}
            </span>
            <span className="text-xs text-gray-500">/ 100</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {dimensions.map((dim) => (
            <div key={dim.label} className="flex items-center gap-2">
              <span className="w-32 text-sm text-gray-600">
                {dim.label} ({dim.weight})
              </span>
              <div className="h-2 flex-1 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${dim.value}%`,
                    backgroundColor: getScoreColor(dim.value),
                  }}
                />
              </div>
              <span className="w-8 text-right text-sm font-medium">
                {dim.value}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-gray-500">Trend:</span>
        <span
          className={`font-medium ${
            score.trend === 'IMPROVING'
              ? 'text-green-600'
              : score.trend === 'DECLINING'
                ? 'text-red-600'
                : 'text-gray-600'
          }`}
        >
          {score.trend}
        </span>
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  return '#ef4444';
}
