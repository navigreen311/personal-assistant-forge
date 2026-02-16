'use client';

import React from 'react';
import type { ESignRequest } from '../types';

interface Props {
  request: ESignRequest;
}

export function ESignTracker({ request }: Props) {
  const statusColors: Record<string, string> = { PENDING: '#eab308', SIGNED: '#22c55e', DECLINED: '#ef4444' };

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontWeight: 600 }}>E-Signature Status</h3>
        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, backgroundColor: request.status === 'COMPLETE' ? '#dcfce7' : '#fef3c7', color: request.status === 'COMPLETE' ? '#166534' : '#92400e' }}>
          {request.status}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {request.signers.sort((a, b) => a.order - b.order).map((signer) => (
          <div key={signer.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{signer.name}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{signer.email}</div>
            </div>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: statusColors[signer.status] || '#d1d5db' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
