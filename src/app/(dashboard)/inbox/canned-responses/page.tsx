'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CannedResponseManager } from '@/modules/inbox/components/CannedResponseManager';
import type { CannedResponse, CreateCannedResponseInput } from '@/modules/inbox/inbox.types';

export default function CannedResponsesPage() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [entityId, setEntityId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchResponses = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/canned-responses?entityId=${entityId}`);
      const data = await res.json();
      if (data.success) {
        setResponses(data.data);
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { fetchResponses(); }, [fetchResponses]);

  const handleCreate = useCallback(async (input: CreateCannedResponseInput) => {
    await fetch('/api/inbox/canned-responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    fetchResponses();
  }, [fetchResponses]);

  const handleUpdate = useCallback(async (id: string, updates: Partial<CreateCannedResponseInput>) => {
    await fetch(`/api/inbox/canned-responses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    fetchResponses();
  }, [fetchResponses]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/inbox/canned-responses/${id}`, {
      method: 'DELETE',
    });
    fetchResponses();
  }, [fetchResponses]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Canned Responses</h1>

      {/* Entity selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, marginRight: 8 }}>Entity ID:</label>
        <input
          type="text"
          placeholder="Enter entity ID to load responses..."
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 300 }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : entityId ? (
        <CannedResponseManager
          responses={responses}
          entityId={entityId}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onInsert={() => {}}
        />
      ) : (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
          Enter an entity ID to manage canned responses.
        </div>
      )}
    </div>
  );
}
