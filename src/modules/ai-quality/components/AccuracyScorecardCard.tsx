'use client';

import type { AccuracyScorecard } from '../types';

interface Props {
  scorecard: AccuracyScorecard;
}

const gradeColors = {
  A: 'text-green-600 bg-green-50 border-green-200',
  B: 'text-blue-600 bg-blue-50 border-blue-200',
  C: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  D: 'text-orange-600 bg-orange-50 border-orange-200',
  F: 'text-red-600 bg-red-50 border-red-200',
};

export default function AccuracyScorecardCard({ scorecard }: Props) {
  const dimensions = [
    { label: 'Triage Accuracy', value: scorecard.triageAccuracy },
    { label: 'Draft Approval', value: scorecard.draftApprovalRate },
    { label: 'Deadline Performance', value: 100 - scorecard.missedDeadlineRate },
    { label: 'Automation Success', value: scorecard.automationSuccessRate },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            AI Quality Scorecard
          </h3>
          <p className="text-sm text-gray-500">{scorecard.period}</p>
        </div>
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-xl border-2 text-3xl font-bold ${gradeColors[scorecard.overallGrade]}`}
        >
          {scorecard.overallGrade}
        </div>
      </div>

      <div className="space-y-3">
        {dimensions.map((dim) => (
          <div key={dim.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">{dim.label}</span>
              <span className="font-medium">{dim.value}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${dim.value}%`,
                  backgroundColor: dim.value >= 80 ? '#22c55e' : dim.value >= 60 ? '#eab308' : '#ef4444',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
