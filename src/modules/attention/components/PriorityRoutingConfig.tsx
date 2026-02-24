'use client';

import React from 'react';
import type { PriorityRouting } from '../types';

interface Props {
  config: PriorityRouting[];
  onChange: (config: PriorityRouting[]) => void;
}

const actions: PriorityRouting['action'][] = ['INTERRUPT', 'NEXT_DIGEST', 'WEEKLY_REVIEW', 'SILENT'];

export function PriorityRoutingConfig({ config, onChange }: Props) {
  const updateRule = (index: number, updates: Partial<PriorityRouting>) => {
    const updated = config.map((rule, i) => (i === index ? { ...rule, ...updates } : rule));
    onChange(updated);
  };

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Priority Routing Rules</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {(config ?? []).map((rule, index) => (
          <div key={rule.priority} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
            <span style={{ fontWeight: 600, minWidth: '40px' }}>{rule.priority}</span>
            <select
              value={rule.action}
              onChange={(e) => updateRule(index, { action: e.target.value as PriorityRouting['action'] })}
              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
            >
              {actions.map((a) => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
