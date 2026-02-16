'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FollowUpList } from '@/modules/inbox/components/FollowUpList';
import type { FollowUpReminder } from '@/modules/inbox/inbox.types';
import { addDays } from 'date-fns';

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUpReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEntity) params.set('entityId', filterEntity);
      const res = await fetch(`/api/inbox/follow-up?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setFollowUps(data.data);
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [filterEntity]);

  useEffect(() => { fetchFollowUps(); }, [fetchFollowUps]);

  const handleComplete = useCallback(async (id: string) => {
    await fetch(`/api/inbox/follow-up/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleSnooze = useCallback(async (id: string, days: number) => {
    const newDate = addDays(new Date(), days);
    await fetch(`/api/inbox/follow-up/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SNOOZED', reminderAt: newDate.toISOString() }),
    });
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleCancel = useCallback(async (id: string) => {
    await fetch(`/api/inbox/follow-up/${id}`, {
      method: 'DELETE',
    });
    fetchFollowUps();
  }, [fetchFollowUps]);

  const filtered = filterStatus
    ? followUps.filter((f) => f.status === filterStatus)
    : followUps;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Follow-Up Reminders</h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Filter by entity ID..."
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="SNOOZED">Snoozed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : (
        <FollowUpList
          followUps={filtered}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
