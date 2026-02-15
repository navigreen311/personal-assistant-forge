'use client';

import React from 'react';
import type { DocumentVersion } from '../types';

interface Props {
  versions: DocumentVersion[];
}

export function VersionTimeline({ versions }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {versions.map((version, index) => (
        <div key={version.id} style={{ display: 'flex', gap: '16px', paddingBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: index === 0 ? '#3b82f6' : '#d1d5db' }} />
            {index < versions.length - 1 && <div style={{ width: '2px', flex: 1, backgroundColor: '#e5e7eb' }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Version {version.version}</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>{version.createdAt.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>{version.changeDescription}</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>by {version.changedBy}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
