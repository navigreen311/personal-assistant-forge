'use client';

import React from 'react';

/**
 * Crisis Playbooks tab — placeholder with a guided empty state.
 *
 * Real implementation should list playbooks, support creating / editing
 * playbook steps, and trigger drills. Tracked as follow-up.
 */
export default function CrisisPlaybooksTab() {
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
        📘
      </div>
      <p style={{ color: '#111827', fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
        Crisis playbooks
      </p>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>
        Step-by-step response plans for known crisis scenarios.
      </p>
      <p style={{ color: '#9ca3af', fontSize: 12 }}>
        Full playbook editor coming soon — see repo issue tracker for status.
      </p>
    </div>
  );
}
