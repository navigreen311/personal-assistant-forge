'use client';

import React, { useState } from 'react';
import type { Tone, MessageChannel } from '@/shared/types';
import type { CannedResponse, CreateCannedResponseInput } from '../inbox.types';

interface CannedResponseManagerProps {
  responses: CannedResponse[];
  entityId: string;
  onCreate: (input: CreateCannedResponseInput) => void;
  onUpdate: (id: string, updates: Partial<CreateCannedResponseInput>) => void;
  onDelete: (id: string) => void;
  onInsert: (response: CannedResponse) => void;
}

const TONES: Tone[] = [
  'FORMAL', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FIRM', 'EMPATHETIC', 'AUTHORITATIVE',
];

const CHANNELS: MessageChannel[] = [
  'EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL',
];

const emptyForm: CreateCannedResponseInput = {
  name: '',
  entityId: '',
  channel: 'EMAIL',
  category: '',
  body: '',
  tone: 'FORMAL',
};

export function CannedResponseManager({
  responses,
  entityId,
  onCreate,
  onUpdate,
  onDelete,
  onInsert,
}: CannedResponseManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateCannedResponseInput>({ ...emptyForm, entityId });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterChannel, setFilterChannel] = useState<MessageChannel | ''>('');

  // Group by category
  const filtered = responses.filter((r) => {
    if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase()) && !r.body.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterChannel && r.channel !== filterChannel) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, CannedResponse[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  const handleSubmit = () => {
    if (!form.name || !form.body || !form.category) return;
    if (editingId) {
      onUpdate(editingId, form);
      setEditingId(null);
    } else {
      onCreate({ ...form, entityId });
    }
    setForm({ ...emptyForm, entityId });
    setShowForm(false);
  };

  const startEdit = (response: CannedResponse) => {
    setForm({
      name: response.name,
      entityId: response.entityId,
      channel: response.channel,
      category: response.category,
      subject: response.subject,
      body: response.body,
      variables: response.variables,
      tone: response.tone,
    });
    setEditingId(response.id);
    setShowForm(true);
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search responses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        />
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value as MessageChannel | '')}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
        >
          <option value="">All Channels</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ ...emptyForm, entityId }); }}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 13,
          }}
        >
          {showForm ? 'Cancel' : 'New Response'}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, background: '#f9fafb' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>
            {editingId ? 'Edit Response' : 'New Canned Response'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            />
            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            />
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as MessageChannel })}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
            <select
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value as Tone })}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <input
            placeholder="Subject (optional)"
            value={form.subject ?? ''}
            onChange={(e) => setForm({ ...form, subject: e.target.value || undefined })}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginTop: 12 }}
          />
          <textarea
            placeholder="Response body... Use {{variable}} for placeholders"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            style={{
              width: '100%', minHeight: 120, padding: 12, border: '1px solid #d1d5db',
              borderRadius: 6, fontSize: 13, marginTop: 12, resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              marginTop: 12, padding: '8px 20px', borderRadius: 6, border: 'none',
              background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 13,
            }}
          >
            {editingId ? 'Update' : 'Create'}
          </button>
        </div>
      )}

      {/* Grouped list */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
            {category}
          </h4>
          {items.map((response) => (
            <div
              key={response.id}
              style={{
                padding: 12, border: '1px solid #f3f4f6', borderRadius: 6,
                marginBottom: 8, background: 'white',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{response.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                    {response.channel} | {response.tone} | Used {response.usageCount}x
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => onInsert(response)}
                    style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 11 }}
                  >
                    Insert
                  </button>
                  <button
                    onClick={() => startEdit(response)}
                    style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 11 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(response.id)}
                    style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {response.body.substring(0, 200)}{response.body.length > 200 ? '...' : ''}
              </div>
              {response.variables.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {response.variables.map((v) => (
                    <span
                      key={v}
                      style={{ fontSize: 10, padding: '1px 6px', background: '#fef3c7', borderRadius: 4, color: '#92400e' }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
          <p>No canned responses found.</p>
        </div>
      )}
    </div>
  );
}
