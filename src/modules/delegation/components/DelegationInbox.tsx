'use client';

import React from 'react';
import type { DelegationInboxItem } from '../types';

interface Props {
  items: DelegationInboxItem[];
  onDelegate: (item: DelegationInboxItem) => void;
}

const priorityColors: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: '#fee2e2', text: '#991b1b' },
  MEDIUM: { bg: '#fef3c7', text: '#92400e' },
  LOW: { bg: '#dbeafe', text: '#1e40af' },
};

export function DelegationInbox({ items, onDelegate }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        No delegation suggestions at this time.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {items.map((item) => {
        const colors = priorityColors[item.priority] || priorityColors.LOW;
        return (
          <div key={item.taskId} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600 }}>{item.taskTitle}</span>
              <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', backgroundColor: colors.bg, color: colors.text }}>
                {item.priority}
              </span>
            </div>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>{item.reason}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                Suggested: {item.suggestedDelegatee} | Save ~{item.estimatedTimeSavedMinutes}min | Confidence: {Math.round(item.confidence * 100)}%
              </div>
              <button
                onClick={() => onDelegate(item)}
                style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                Delegate
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
