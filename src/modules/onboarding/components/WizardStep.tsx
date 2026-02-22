'use client';

import React from 'react';
import type { OnboardingStep } from '../types';

interface Props {
  step: OnboardingStep;
  onComplete: () => void;
  onSkip: () => void;
  onBack?: () => void;
  isFirstStep?: boolean;
}

const categoryConfig: Record<string, { color: string; bg: string; label: string }> = {
  CONNECT: { color: 'text-blue-600', bg: 'bg-blue-100', label: 'CONNECT' },
  IMPORT: { color: 'text-purple-600', bg: 'bg-purple-100', label: 'IMPORT' },
  CONFIGURE: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'CONFIGURE' },
  LEARN: { color: 'text-green-600', bg: 'bg-green-100', label: 'LEARN' },
};

export function WizardStep({ step, onComplete, onSkip, onBack, isFirstStep }: Props) {
  const cat = categoryConfig[step.category] || { color: 'text-gray-600', bg: 'bg-gray-100', label: step.category };

  return (
    <div className="p-8 border border-gray-200 rounded-2xl max-w-[600px] w-full bg-white shadow-sm">
      {/* Header badges */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${cat.bg} ${cat.color}`}>
          {cat.label}
        </span>
        <span className="text-sm text-gray-500">
          Step {step.order}
        </span>
        {step.isRequired ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
            Required
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Optional
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          ~{step.estimatedMinutes} min
        </span>
      </div>

      {/* Title and description */}
      <h2 className="text-xl font-semibold mb-2">{step.title}</h2>
      <p className="text-gray-500 mb-8 leading-relaxed">{step.description}</p>

      {/* Action buttons */}
      <div className="flex gap-3 items-center">
        {!isFirstStep && onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-transparent text-gray-500 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={onComplete}
          className="px-6 py-2.5 bg-blue-500 text-white border-none rounded-lg cursor-pointer font-medium hover:bg-blue-600 transition-colors"
        >
          Complete Step
        </button>
        {!step.isRequired && (
          <button
            onClick={onSkip}
            className="px-5 py-2.5 bg-transparent text-gray-500 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
