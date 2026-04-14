'use client';

import React from 'react';

/**
 * Crisis History tab — placeholder with a guided empty state.
 *
 * Real implementation should list past crises, drill-downs, timeline,
 * and post-incident reports. Tracked as follow-up.
 */
export default function CrisisHistoryTab() {
  return (
    <div
      style={{
        padding: 32,
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }} aria-hidden="true">
        📜
      </div>
      <p style={{ color: '#111827', fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
        Crisis history
      </p>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>
        No past crises recorded. Declared crises will appear here with timelines,
        escalations, and post-incident reports.
      </p>
      <p style={{ color: '#9ca3af', fontSize: 12 }}>
        Full history view coming soon — see repo issue tracker.
      </p>
    </div>
  );
}
