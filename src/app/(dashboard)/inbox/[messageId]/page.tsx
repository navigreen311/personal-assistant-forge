'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MessageDetail } from '@/modules/inbox/components/MessageDetail';
import type { InboxItem } from '@/modules/inbox/inbox.types';

export default function InboxMessagePage() {
  const params = useParams();
  const router = useRouter();
  const messageId = params.messageId as string;
  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/inbox/${messageId}`);
        const data = await res.json();
        if (data.success) {
          setItem(data.data);
        }
      } catch {
        // Handle error
      } finally {
        setLoading(false);
      }
    }
    if (messageId) load();
  }, [messageId]);

  const handleArchive = useCallback(async (id: string) => {
    await fetch(`/api/inbox/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    router.push('/inbox');
  }, [router]);

  const handleStar = useCallback(async (id: string) => {
    await fetch(`/api/inbox/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStarred: true }),
    });
    // Reload
    const res = await fetch(`/api/inbox/${id}`);
    const data = await res.json();
    if (data.success) setItem(data.data);
  }, []);

  const handleFollowUp = useCallback(async (id: string, date: Date) => {
    await fetch('/api/inbox/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: id,
        entityId: item?.message.entityId ?? '',
        reminderAt: date.toISOString(),
      }),
    });
  }, [item]);

  const handleGenerateDraft = useCallback(async (id: string) => {
    const res = await fetch('/api/inbox/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: id,
        entityId: item?.message.entityId ?? '',
      }),
    });
    const data = await res.json();
    if (data.success && item) {
      setItem({ ...item, draft: data.data });
    }
  }, [item]);

  const handleSendDraft = useCallback(async (id: string) => {
    await fetch('/api/inbox/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id }),
    });
    router.push('/inbox');
  }, [router]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
        Loading message...
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 16, color: '#dc2626' }}>Message not found</p>
        <button
          onClick={() => router.push('/inbox')}
          style={{ marginTop: 12, padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer', background: 'white' }}
        >
          Back to Inbox
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => router.push('/inbox')}
          style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer', background: 'white', fontSize: 13 }}
        >
          Back
        </button>
        {item.message.threadId && (
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Thread: {item.message.threadId.substring(0, 12)}...
          </span>
        )}
      </div>

      {/* Message detail */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MessageDetail
          item={item}
          onArchive={handleArchive}
          onReply={() => {}}
          onStar={handleStar}
          onFollowUp={handleFollowUp}
          onSendDraft={handleSendDraft}
          onGenerateDraft={handleGenerateDraft}
        />
      </div>
    </div>
  );
}
