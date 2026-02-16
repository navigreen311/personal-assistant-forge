'use client';

import React from 'react';
import type { NotificationLearning } from '../types';

interface Props {
  learning: NotificationLearning;
}

export function NotificationLearningPanel({ learning }: Props) {
  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Notification Patterns</h3>
      {learning.patterns.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Source</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Open Rate</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Avg Response</th>
              </tr>
            </thead>
            <tbody>
              {learning.patterns.map((p) => (
                <tr key={p.source} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px' }}>{p.source}</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{Math.round(p.averageOpenRate * 100)}%</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{Math.round(p.averageResponseTime)}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {learning.suggestions.length > 0 && (
        <div>
          <h4 style={{ fontWeight: 500, marginBottom: '8px' }}>Suggestions</h4>
          <ul style={{ listStyle: 'disc', paddingLeft: '20px' }}>
            {learning.suggestions.map((s, i) => (
              <li key={i} style={{ padding: '4px 0', fontSize: '14px' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
