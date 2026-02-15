'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { InboxList } from '@/modules/inbox/components/InboxList';
import { InboxFilters } from '@/modules/inbox/components/InboxFilters';
import { MessageDetail } from '@/modules/inbox/components/MessageDetail';
import { BatchTriagePanel } from '@/modules/inbox/components/BatchTriagePanel';
import type { InboxItem, InboxFilters as InboxFiltersType, InboxStats, BatchTriageResult } from '@/modules/inbox/inbox.types';

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [filters, setFilters] = useState<InboxFiltersType>({});
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) {
          params.set(key, value instanceof Date ? value.toISOString() : String(value));
        }
      }
      const res = await fetch(`/api/inbox?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setStats(data.data.stats);
      }
    } catch {
      // Handle error silently
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const handleSelectMessage = useCallback(async (messageId: string) => {
    setSelectedMessageId(messageId);
    try {
      const res = await fetch(`/api/inbox/${messageId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedItem(data.data);
      }
    } catch {
      // Handle error
    }
  }, []);

  const handleArchive = useCallback(async (messageId: string) => {
    await fetch(`/api/inbox/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    fetchInbox();
    setSelectedItem(null);
    setSelectedMessageId(null);
  }, [fetchInbox]);

  const handleStar = useCallback(async (messageId: string) => {
    await fetch(`/api/inbox/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStarred: true }),
    });
    fetchInbox();
  }, [fetchInbox]);

  const handleFollowUp = useCallback(async (messageId: string, date: Date) => {
    const item = items.find((i) => i.message.id === messageId);
    await fetch('/api/inbox/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        entityId: item?.message.entityId ?? '',
        reminderAt: date.toISOString(),
      }),
    });
  }, [items]);

  const handleGenerateDraft = useCallback(async (messageId: string) => {
    const item = items.find((i) => i.message.id === messageId);
    const res = await fetch('/api/inbox/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        entityId: item?.message.entityId ?? '',
      }),
    });
    const data = await res.json();
    if (data.success && selectedItem) {
      setSelectedItem({ ...selectedItem, draft: data.data });
    }
  }, [items, selectedItem]);

  const handleSendDraft = useCallback(async (messageId: string) => {
    await fetch('/api/inbox/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    });
    fetchInbox();
  }, [fetchInbox]);

  const handleBatchTriage = useCallback(async (entityId: string, messageIds: string[]): Promise<BatchTriageResult | null> => {
    const res = await fetch('/api/inbox/triage/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, messageIds }),
    });
    const data = await res.json();
    if (data.success) {
      fetchInbox();
      return data.data;
    }
    return null;
  }, [fetchInbox]);

  const handleBatchTriageAll = useCallback(async (entityId: string): Promise<BatchTriageResult | null> => {
    const res = await fetch('/api/inbox/triage/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId }),
    });
    const data = await res.json();
    if (data.success) {
      fetchInbox();
      return data.data;
    }
    return null;
  }, [fetchInbox]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 24, padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>
          <span>Total: <strong>{stats.total}</strong></span>
          <span>Unread: <strong>{stats.unread}</strong></span>
          <span style={{ color: stats.urgent > 0 ? '#dc2626' : undefined }}>Urgent: <strong>{stats.urgent}</strong></span>
          <span>Needs Response: <strong>{stats.needsResponse}</strong></span>
          <span>Avg Score: <strong>{stats.avgTriageScore}</strong></span>
          <button
            onClick={() => setShowBatchPanel(!showBatchPanel)}
            style={{ marginLeft: 'auto', padding: '2px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12, background: showBatchPanel ? '#eff6ff' : 'white' }}
          >
            Batch Triage
          </button>
        </div>
      )}

      {/* Batch triage panel */}
      {showBatchPanel && (
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
          <BatchTriagePanel
            selectedIds={batchSelectedIds}
            entityId={filters.entityId ?? ''}
            onTriageSelected={handleBatchTriage}
            onTriageAll={handleBatchTriageAll}
            onArchiveLowPriority={() => {}}
            onFlagUrgent={() => {}}
          />
        </div>
      )}

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel: list + filters */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb' }}>
          <InboxFilters filters={filters} onFiltersChange={setFilters} />
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 14 }}>Loading...</div>
            </div>
          ) : (
            <InboxList
              items={items}
              selectedId={selectedMessageId ?? undefined}
              onSelect={handleSelectMessage}
              onBatchSelect={setBatchSelectedIds}
            />
          )}
        </div>

        {/* Right panel: detail */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {selectedItem ? (
            <MessageDetail
              item={selectedItem}
              onArchive={handleArchive}
              onReply={() => {}}
              onStar={handleStar}
              onFollowUp={handleFollowUp}
              onSendDraft={handleSendDraft}
              onGenerateDraft={handleGenerateDraft}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 18 }}>Select a message</p>
                <p style={{ fontSize: 13 }}>Choose a message from the list to view its details.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
