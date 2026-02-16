'use client';

import React from 'react';
import type { WebhookConfig } from '../types';

interface Props {
  webhooks: WebhookConfig[];
}

export function WebhookManager({ webhooks }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {webhooks.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No webhooks configured</div>
      ) : (
        webhooks.map((webhook) => (
          <div key={webhook.id} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600 }}>{webhook.url}</span>
              <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', backgroundColor: webhook.isActive ? '#dcfce7' : '#fee2e2', color: webhook.isActive ? '#166534' : '#991b1b' }}>
                {webhook.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {webhook.direction} &middot; Events: {webhook.events.join(', ')}
            </div>
            {webhook.failureCount > 0 && (
              <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                {webhook.failureCount} failures
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
