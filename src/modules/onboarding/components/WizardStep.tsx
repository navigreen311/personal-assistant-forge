'use client';

import React from 'react';
import type { OnboardingStep } from '../types';

interface Props {
  step: OnboardingStep;
  onComplete: () => void;
  onSkip: () => void;
}

const categoryColors: Record<string, string> = {
  CONNECT: '#3b82f6',
  IMPORT: '#8b5cf6',
  CONFIGURE: '#f59e0b',
  LEARN: '#22c55e',
};

export function WizardStep({ step, onComplete, onSkip }: Props) {
  return (
    <div style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: '12px', maxWidth: '600px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{
          padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
          backgroundColor: `${categoryColors[step.category] || '#6b7280'}20`,
          color: categoryColors[step.category] || '#6b7280',
        }}>
          {step.category}
        </span>
        <span style={{ fontSize: '14px', color: '#6b7280' }}>Step {step.order}</span>
        {step.isRequired && <span style={{ fontSize: '12px', color: '#ef4444' }}>Required</span>}
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>{step.title}</h2>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>{step.description}</p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={onComplete}
          style={{
            padding: '10px 24px', backgroundColor: '#3b82f6', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500,
          }}
        >
          Complete Step
        </button>
        {!step.isRequired && (
          <button
            onClick={onSkip}
            style={{
              padding: '10px 24px', backgroundColor: 'transparent', color: '#6b7280',
              border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
