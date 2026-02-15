'use client';

import React from 'react';
import type { FollowUpReminder } from '../inbox.types';

interface FollowUpListProps {
  followUps: FollowUpReminder[];
  onComplete: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onCancel: (id: string) => void;
}

function isOverdue(date: Date): boolean {
  return new Date(date).getTime() < Date.now();
}

export function FollowUpList({
  followUps,
  onComplete,
  onSnooze,
  onCancel,
}: FollowUpListProps) {
  if (followUps.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
        <p style={{ fontSize: 16 }}>No follow-ups</p>
        <p style={{ fontSize: 13 }}>No pending follow-up reminders.</p>
      </div>
    );
  }

  return (
    <div>
      {followUps.map((followUp) => {
        const overdue = isOverdue(followUp.reminderAt);
        return (
          <div
            key={followUp.id}
            style={{
              padding: 16,
              borderBottom: '1px solid #f3f4f6',
              background: overdue ? '#fef2f2' : 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{followUp.reason}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  Message: {followUp.messageId.substring(0, 12)}...
                </div>
                <div style={{ fontSize: 12, color: overdue ? '#dc2626' : '#9ca3af', marginTop: 2 }}>
                  {overdue ? 'OVERDUE — ' : ''}
                  Due: {new Date(followUp.reminderAt).toLocaleDateString()} at{' '}
                  {new Date(followUp.reminderAt).toLocaleTimeString()}
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: followUp.status === 'PENDING' ? '#eff6ff' : followUp.status === 'COMPLETED' ? '#f0fdf4' : '#f3f4f6',
                color: followUp.status === 'PENDING' ? '#2563eb' : followUp.status === 'COMPLETED' ? '#16a34a' : '#6b7280',
              }}>
                {followUp.status}
              </span>
            </div>

            {followUp.status === 'PENDING' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => onComplete(followUp.id)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: 'none',
                    background: '#22c55e', color: 'white', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Complete
                </button>
                <button
                  onClick={() => onSnooze(followUp.id, 1)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db',
                    background: 'white', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  +1 Day
                </button>
                <button
                  onClick={() => onSnooze(followUp.id, 3)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db',
                    background: 'white', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  +3 Days
                </button>
                <button
                  onClick={() => onSnooze(followUp.id, 7)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db',
                    background: 'white', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  +1 Week
                </button>
                <button
                  onClick={() => onCancel(followUp.id)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: '1px solid #ef4444',
                    background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12,
                    marginLeft: 'auto',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
