'use client';

import React, { useState } from 'react';
import type { NotificationBundle } from '../types';
import { TalkMeThroughButton } from '@/components/notifications/TalkMeThroughButton';

interface Props {
  bundles: NotificationBundle[];
}

export function NotificationDigest({ bundles }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleBundle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!bundles || bundles.length === 0) {
    return <div style={{ padding: '16px', color: '#6b7280' }}>No notifications</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {bundles.map((bundle) => (
        <div key={bundle.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <button
            onClick={() => toggleBundle(bundle.id)}
            style={{
              width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', backgroundColor: '#f9fafb', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 500 }}>{bundle.title}</span>
            <span style={{
              padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
              backgroundColor: bundle.priority === 'P1' ? '#fef3c7' : '#dbeafe',
              color: bundle.priority === 'P1' ? '#92400e' : '#1e40af',
            }}>
              {bundle.priority}
            </span>
          </button>
          {expandedIds.has(bundle.id) && (
            <div style={{ padding: '8px 16px' }}>
              {bundle.items.map((item) => (
                <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 500 }}>{item.title}</div>
                    <TalkMeThroughButton
                      notificationId={item.id}
                      title={item.title}
                      description={item.body ?? ''}
                      priority={bundle.priority}
                    />
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>{item.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
