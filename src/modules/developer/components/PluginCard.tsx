'use client';

import React from 'react';
import type { PluginDefinition } from '../types';

interface Props {
  plugin: PluginDefinition;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: '#f3f4f6', text: '#6b7280' },
  REVIEW: { bg: '#fef3c7', text: '#92400e' },
  APPROVED: { bg: '#dcfce7', text: '#166534' },
  PUBLISHED: { bg: '#dbeafe', text: '#1e40af' },
  REVOKED: { bg: '#fee2e2', text: '#991b1b' },
};

export function PluginCard({ plugin }: Props) {
  const colors = statusColors[plugin.status] || statusColors.DRAFT;

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
        <h3 style={{ fontWeight: 600 }}>{plugin.name}</h3>
        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', backgroundColor: colors.bg, color: colors.text }}>
          {plugin.status}
        </span>
      </div>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>{plugin.description}</p>
      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>v{plugin.version} by {plugin.author}</div>
      {plugin.permissions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {plugin.permissions.map((perm) => (
            <span key={perm} style={{ padding: '2px 6px', backgroundColor: '#f3f4f6', borderRadius: '4px', fontSize: '11px' }}>{perm}</span>
          ))}
        </div>
      )}
    </div>
  );
}
