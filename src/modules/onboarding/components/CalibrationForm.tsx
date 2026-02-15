'use client';

import React from 'react';
import type { PersonalityCalibration } from '../types';

interface Props {
  calibration: PersonalityCalibration;
  onUpdate: (updates: Partial<PersonalityCalibration>) => void;
}

export function CalibrationForm({ calibration, onUpdate }: Props) {
  const fields: { key: keyof PersonalityCalibration; label: string; options: string[] }[] = [
    { key: 'communicationStyle', label: 'Communication Style', options: ['FORMAL', 'CASUAL', 'ADAPTIVE'] },
    { key: 'decisionSpeed', label: 'Decision Speed', options: ['DELIBERATE', 'BALANCED', 'QUICK'] },
    { key: 'detailPreference', label: 'Detail Preference', options: ['HIGH', 'MEDIUM', 'LOW'] },
    { key: 'riskTolerance', label: 'Risk Tolerance', options: ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] },
    { key: 'autonomyComfort', label: 'AI Autonomy Comfort', options: ['LOW', 'MEDIUM', 'HIGH'] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {fields.map((field) => (
        <div key={field.key}>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>{field.label}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {field.options.map((option) => (
              <button
                key={option}
                onClick={() => onUpdate({ [field.key]: option })}
                style={{
                  flex: 1, padding: '10px', border: '2px solid',
                  borderColor: calibration[field.key] === option ? '#3b82f6' : '#e5e7eb',
                  backgroundColor: calibration[field.key] === option ? '#eff6ff' : 'white',
                  borderRadius: '8px', cursor: 'pointer', fontWeight: calibration[field.key] === option ? 600 : 400,
                }}
              >
                {option.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
