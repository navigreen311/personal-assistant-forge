'use client';

import React from 'react';
import type { ToneTrainingSample } from '../types';

interface Props {
  sample: ToneTrainingSample;
  onRate: (rating: number) => void;
}

export function ToneTrainer({ sample, onRate }: Props) {
  return (
    <div style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
      <div style={{ marginBottom: '8px', fontSize: '14px', color: '#6b7280' }}>
        Context: {sample.context}
      </div>
      <div style={{
        padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px',
        marginBottom: '16px', lineHeight: '1.6',
      }}>
        {sample.sampleText}
      </div>
      <div style={{ marginBottom: '8px', fontWeight: 500 }}>How does this sound?</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            onClick={() => onRate(rating)}
            style={{
              width: '40px', height: '40px', borderRadius: '50%', border: '2px solid',
              borderColor: sample.userRating === rating ? '#3b82f6' : '#e5e7eb',
              backgroundColor: sample.userRating === rating ? '#3b82f6' : 'white',
              color: sample.userRating === rating ? 'white' : '#374151',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            {rating}
          </button>
        ))}
      </div>
      {sample.adjustments.length > 0 && (
        <div style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
          Adjustments: {sample.adjustments.join(', ')}
        </div>
      )}
    </div>
  );
}
