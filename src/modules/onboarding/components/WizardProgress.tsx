'use client';

import React from 'react';
import type { OnboardingWizard } from '../types';

interface Props {
  wizard: OnboardingWizard;
}

export function WizardProgress({ wizard }: Props) {
  const completedCount = wizard.steps.filter((s) => s.status === 'COMPLETE' || s.status === 'SKIPPED').length;
  const percentage = Math.round((completedCount / wizard.totalSteps) * 100);

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: 600 }}>Setup Progress</span>
        <span>{percentage}% complete</span>
      </div>
      <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginBottom: '16px' }}>
        <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: '4px', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {wizard.steps.map((step) => (
          <div
            key={step.id}
            title={step.title}
            style={{
              flex: 1, height: '4px', borderRadius: '2px',
              backgroundColor: step.status === 'COMPLETE' ? '#22c55e' : step.status === 'SKIPPED' ? '#9ca3af' : step.status === 'IN_PROGRESS' ? '#3b82f6' : '#e5e7eb',
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
        ~{wizard.estimatedMinutesRemaining} minutes remaining
      </div>
    </div>
  );
}
