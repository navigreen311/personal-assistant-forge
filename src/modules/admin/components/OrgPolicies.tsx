'use client';

import React from 'react';
import type { OrgPolicy } from '../types';

interface Props {
  policies: OrgPolicy[];
  onDelete: (policyId: string) => void;
  onToggle: (policyId: string, isActive: boolean) => void;
}

const typeColors: Record<string, string> = {
  RETENTION: '#dbeafe',
  SHARING: '#fef3c7',
  COMPLIANCE: '#dcfce7',
  ACCESS: '#ede9fe',
  DLP: '#fee2e2',
};

export function OrgPolicies({ policies, onDelete, onToggle }: Props) {
  if (policies.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        No policies configured.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {policies.map((policy) => (
        <div key={policy.id} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{policy.name}</span>
              <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', backgroundColor: typeColors[policy.type] || '#f3f4f6' }}>
                {policy.type}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => onToggle(policy.id, !policy.isActive)}
                style={{
                  padding: '2px 8px', borderRadius: '12px', fontSize: '12px', border: 'none', cursor: 'pointer',
                  backgroundColor: policy.isActive ? '#dcfce7' : '#fee2e2',
                  color: policy.isActive ? '#166534' : '#991b1b',
                }}
              >
                {policy.isActive ? 'Active' : 'Inactive'}
              </button>
              <button
                onClick={() => onDelete(policy.id)}
                style={{ padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px', backgroundColor: 'white', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
              >
                Delete
              </button>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            Entity: {policy.entityId} | Updated: {new Date(policy.updatedAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
