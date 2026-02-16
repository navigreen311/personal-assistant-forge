'use client';

import React from 'react';
import type { DataMigrationSource } from '../types';

interface Props {
  source: DataMigrationSource;
  onConnect: () => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  NOT_STARTED: { bg: '#f3f4f6', text: '#6b7280' },
  CONNECTING: { bg: '#fef3c7', text: '#92400e' },
  IMPORTING: { bg: '#dbeafe', text: '#1e40af' },
  COMPLETE: { bg: '#dcfce7', text: '#166534' },
  FAILED: { bg: '#fee2e2', text: '#991b1b' },
};

export function MigrationSourceCard({ source, onConnect }: Props) {
  const colors = statusColors[source.status] || statusColors.NOT_STARTED;

  return (
    <div style={{
      padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 600 }}>{source.name}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>{source.category}</div>
        {source.importedCount !== undefined && (
          <div style={{ fontSize: '12px', color: '#6b7280' }}>{source.importedCount} items imported</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{
          padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
          backgroundColor: colors.bg, color: colors.text,
        }}>
          {source.status.replace(/_/g, ' ')}
        </span>
        {source.status === 'NOT_STARTED' && (
          <button
            onClick={onConnect}
            style={{
              padding: '6px 16px', backgroundColor: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
