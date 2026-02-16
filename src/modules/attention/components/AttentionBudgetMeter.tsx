'use client';

import React from 'react';
import type { AttentionBudget } from '../types';

interface Props {
  budget: AttentionBudget;
}

export function AttentionBudgetMeter({ budget }: Props) {
  const percentage = budget.dailyBudget > 0 ? (budget.remaining / budget.dailyBudget) * 100 : 0;
  const color = percentage > 50 ? '#22c55e' : percentage > 20 ? '#eab308' : '#ef4444';

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: 600 }}>Attention Budget</span>
        <span>{budget.remaining} / {budget.dailyBudget} remaining</span>
      </div>
      <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px' }}>
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '4px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
        Used today: {budget.usedToday} interruptions
      </div>
    </div>
  );
}
