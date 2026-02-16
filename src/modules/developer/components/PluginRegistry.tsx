'use client';

import React, { useState } from 'react';
import type { PluginDefinition } from '../types';
import { PluginCard } from './PluginCard';

interface Props {
  plugins: PluginDefinition[];
}

export function PluginRegistry({ plugins }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const statuses = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REVOKED'];

  const filtered = statusFilter ? plugins.filter((p) => p.status === statusFilter) : plugins;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setStatusFilter('')} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: !statusFilter ? '#3b82f6' : 'white', color: !statusFilter ? 'white' : '#374151', cursor: 'pointer' }}>All</button>
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: statusFilter === s ? '#3b82f6' : 'white', color: statusFilter === s ? 'white' : '#374151', cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {filtered.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} />)}
      </div>
    </div>
  );
}
