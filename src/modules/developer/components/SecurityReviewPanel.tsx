'use client';

import React from 'react';
import type { PluginSecurityReview } from '../types';

interface Props {
  review: PluginSecurityReview;
}

const severityColors: Record<string, string> = { CRITICAL: '#991b1b', HIGH: '#dc2626', MEDIUM: '#f59e0b', LOW: '#22c55e' };

export function SecurityReviewPanel({ review }: Props) {
  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontWeight: 600 }}>Security Review</h3>
        <span style={{
          padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
          backgroundColor: review.status === 'APPROVED' ? '#dcfce7' : review.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
          color: review.status === 'APPROVED' ? '#166534' : review.status === 'REJECTED' ? '#991b1b' : '#92400e',
        }}>
          {review.status}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: review.permissionsVerified ? '#22c55e' : '#ef4444' }} />
          Permissions
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: review.isolationVerified ? '#22c55e' : '#ef4444' }} />
          Isolation
        </div>
      </div>
      {review.findings.length > 0 && (
        <div>
          <h4 style={{ fontWeight: 500, marginBottom: '8px' }}>Findings</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {review.findings.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'start', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: severityColors[f.severity] || '#6b7280' }}>{f.severity}</span>
                <span style={{ fontSize: '14px' }}>{f.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
