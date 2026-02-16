'use client';

import React, { useState } from 'react';
import type { InboxItem } from '../inbox.types';
import { TriageScoreBadge } from './TriageScoreBadge';

interface InboxListProps {
  items: InboxItem[];
  selectedId?: string;
  onSelect: (messageId: string) => void;
  onBatchSelect?: (messageIds: string[]) => void;
}

const CHANNEL_ICONS: Record<string, string> = {
  EMAIL: '\u2709', SMS: '\ud83d\udcf1', SLACK: '#', TEAMS: '\ud83d\udcac',
  DISCORD: '\ud83c\udfae', WHATSAPP: '\ud83d\udcde', TELEGRAM: '\u2708',
  VOICE: '\ud83c\udf99', MANUAL: '\u270d',
};

function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function InboxList({
  items,
  selectedId,
  onSelect,
  onBatchSelect,
}: InboxListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    onBatchSelect?.(Array.from(next));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
      onBatchSelect?.([]);
    } else {
      const all = new Set(items.map((i) => i.message.id));
      setSelectedIds(all);
      onBatchSelect?.(Array.from(all));
    }
  };

  if (items.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
        <p style={{ fontSize: 16 }}>No messages</p>
        <p style={{ fontSize: 13 }}>Your inbox is empty or no messages match your filters.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selectedIds.size === items.length && items.length > 0}
            onChange={toggleSelectAll}
          />
          Select All
        </label>
        <button
          onClick={() => setSelectMode(!selectMode)}
          style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', background: selectMode ? '#eff6ff' : 'white' }}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {/* Items */}
      {items.map((item) => {
        const isSelected = item.message.id === selectedId;
        const preview = item.message.body.substring(0, 80);

        return (
          <div
            key={item.message.id}
            onClick={() => !selectMode && onSelect(item.message.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer',
              background: isSelected ? '#eff6ff' : 'white',
              borderLeft: item.isRead ? 'none' : '3px solid #3b82f6',
              fontWeight: item.isRead ? 400 : 600,
            }}
          >
            {/* Checkbox */}
            {selectMode && (
              <input
                type="checkbox"
                checked={selectedIds.has(item.message.id)}
                onChange={() => toggleSelect(item.message.id)}
                onClick={(e) => e.stopPropagation()}
              />
            )}

            {/* Avatar placeholder */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: '#e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, color: '#6b7280', flexShrink: 0,
            }}>
              {item.senderName.charAt(0).toUpperCase()}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.senderName}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  {CHANNEL_ICONS[item.message.channel] ?? ''} {item.message.channel}
                </span>
                {item.isStarred && (
                  <span style={{ color: '#f59e0b', fontSize: 14 }}>{'\u2605'}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.message.subject ?? preview}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview}
              </div>
            </div>

            {/* Right side: score, time, entity */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              <TriageScoreBadge
                score={item.message.triageScore}
                reasoning={item.triageResult?.reasoning}
                size="small"
              />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {timeAgo(item.message.createdAt)}
              </span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8,
                background: '#f3f4f6', color: '#6b7280',
              }}>
                {item.entityName}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
