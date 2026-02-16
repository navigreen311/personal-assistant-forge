'use client';

import React from 'react';
import type { DelegationScore } from '../types';

interface Props {
  scores: DelegationScore[];
}

export function DelegationScoring({ scores }: Props) {
  if (scores.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        No delegation scores yet.
      </div>
    );
  }

  const sorted = [...scores].sort((a, b) => b.overallScore - a.overallScore);

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', padding: '12px' }}>Rank</th>
            <th style={{ textAlign: 'left', padding: '12px' }}>Delegate</th>
            <th style={{ textAlign: 'right', padding: '12px' }}>Overall Score</th>
            <th style={{ textAlign: 'right', padding: '12px' }}>Tasks Completed</th>
            <th style={{ textAlign: 'left', padding: '12px' }}>Best Category</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((score, index) => (
            <tr key={score.delegateeId} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '12px', fontWeight: 600, color: index < 3 ? '#3b82f6' : '#6b7280' }}>#{index + 1}</td>
              <td style={{ padding: '12px' }}>{score.delegateeName || score.delegateeId}</td>
              <td style={{ textAlign: 'right', padding: '12px', fontWeight: 600 }}>{score.overallScore.toFixed(1)}</td>
              <td style={{ textAlign: 'right', padding: '12px' }}>{score.totalTasksDelegated}</td>
              <td style={{ padding: '12px' }}>
                <span style={{ padding: '2px 8px', backgroundColor: '#ede9fe', color: '#5b21b6', borderRadius: '12px', fontSize: '12px' }}>
                  {score.bestCategory}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
