'use client';

import React from 'react';
import type { Redline } from '../types';

interface Props {
  redline: Redline;
}

export function RedlineViewer({ redline }: Props) {
  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>
        Comparing v{redline.version1} → v{redline.version2}
      </h3>
      {redline.changes.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No changes detected</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {redline.changes.map((change, i) => (
            <div key={i} style={{ padding: '8px', borderRadius: '4px', backgroundColor: change.type === 'ADDITION' ? '#dcfce7' : change.type === 'DELETION' ? '#fee2e2' : '#fef3c7' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: change.type === 'ADDITION' ? '#166534' : change.type === 'DELETION' ? '#991b1b' : '#92400e' }}>
                {change.type}
              </span>
              {change.originalText && <div style={{ textDecoration: change.type !== 'ADDITION' ? 'line-through' : 'none', color: '#991b1b' }}>{change.originalText}</div>}
              {change.newText && <div style={{ color: '#166534' }}>{change.newText}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
