'use client';

import React from 'react';
import type { OnboardingWizard, OnboardingStep } from '../types';

interface Props {
  wizard: OnboardingWizard;
  onNavigate: (stepOrder: number) => void;
}

const categoryConfig: Record<string, { color: string; bg: string }> = {
  CONNECT: { color: 'text-blue-600', bg: 'bg-blue-100' },
  IMPORT: { color: 'text-purple-600', bg: 'bg-purple-100' },
  CONFIGURE: { color: 'text-amber-600', bg: 'bg-amber-100' },
  LEARN: { color: 'text-green-600', bg: 'bg-green-100' },
};

function getStatusIcon(status: OnboardingStep['status'], isCurrent: boolean): string {
  if (isCurrent) return '\u{1F535}'; // blue circle
  switch (status) {
    case 'COMPLETE': return '\u2705'; // checkmark
    case 'SKIPPED': return '\u23ED'; // skip
    case 'PENDING': return '\u2B1C'; // white square
    default: return '\u2B1C';
  }
}

export function StepOverview({ wizard, onNavigate }: Props) {
  const completedCount = wizard.steps.filter(
    (s) => s.status === 'COMPLETE' || s.status === 'SKIPPED'
  ).length;
  const percentage = Math.round((completedCount / wizard.totalSteps) * 100);

  return (
    <div className="w-[300px] shrink-0 p-5 bg-gray-50 rounded-2xl border border-gray-200 h-fit">
      {/* Header */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="font-semibold text-sm text-gray-900">Setup Progress</span>
          <span className="text-sm text-gray-500">{percentage}% complete</span>
        </div>
        <div className="text-xs text-gray-400 mb-2">
          ~{wizard.estimatedMinutesRemaining} min remaining
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="flex flex-col gap-1">
        {wizard.steps.map((step) => {
          const isCurrent = step.order === wizard.currentStep;
          const isCompleted = step.status === 'COMPLETE';
          const isSkipped = step.status === 'SKIPPED';
          const canClick = isCompleted || isSkipped || isCurrent || step.status === 'PENDING';
          const cat = categoryConfig[step.category] || { color: 'text-gray-600', bg: 'bg-gray-100' };

          return (
            <button
              key={step.id}
              onClick={() => canClick && onNavigate(step.order)}
              className={`
                flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left w-full border-none cursor-pointer transition-colors
                ${isCurrent ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-transparent hover:bg-gray-100'}
              `}
            >
              {/* Status icon */}
              <span className="text-sm mt-0.5 leading-none shrink-0" role="img" aria-label={step.status}>
                {getStatusIcon(step.status, isCurrent)}
              </span>

              {/* Step info */}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-sm font-medium truncate ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-gray-700' : isSkipped ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                    {step.order}. {step.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.bg} ${cat.color}`}>
                    {step.category}
                  </span>
                  <span className={`text-[10px] ${step.isRequired ? 'text-red-500' : 'text-gray-400'}`}>
                    {step.isRequired ? 'Required' : 'Optional'}
                  </span>
                </div>
              </div>

              {/* Current indicator */}
              {isCurrent && (
                <span className="text-[10px] text-blue-500 font-medium shrink-0 mt-0.5">
                  Current
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
