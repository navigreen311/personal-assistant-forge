'use client';

import React, { useState } from 'react';
import type { Message } from '@/shared/types';
import type { InboxItem } from '../inbox.types';
import { TriageScoreBadge } from './TriageScoreBadge';
import { DraftEditor } from './DraftEditor';

interface MessageDetailProps {
  item: InboxItem;
  onArchive: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onStar: (messageId: string) => void;
  onFollowUp: (messageId: string, date: Date) => void;
  onSendDraft: (messageId: string, body: string) => void;
  onGenerateDraft: (messageId: string) => void;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString();
}

function ThreadMessage({ message }: { message: Message }) {
  return (
    <div style={{ padding: 12, borderLeft: '2px solid #e5e7eb', marginLeft: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{message.senderId}</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(message.createdAt)}</span>
        <span style={{ fontSize: 11, color: '#6b7280', padding: '1px 6px', background: '#f3f4f6', borderRadius: 4 }}>
          {message.channel}
        </span>
      </div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{message.body}</div>
    </div>
  );
}

export function MessageDetail({
  item,
  onArchive,
  onReply,
  onStar,
  onFollowUp,
  onSendDraft,
  onGenerateDraft,
}: MessageDetailProps) {
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const { message, triageResult } = item;

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {message.subject ?? '(No subject)'}
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{item.senderName}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(message.createdAt)}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', background: '#f3f4f6', borderRadius: 4, color: '#6b7280' }}>
                {message.channel}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', background: '#eff6ff', borderRadius: 4, color: '#1d4ed8' }}>
                {item.entityName}
              </span>
            </div>
          </div>
          {triageResult && (
            <TriageScoreBadge
              score={triageResult.urgencyScore}
              reasoning={triageResult.reasoning}
              size="large"
            />
          )}
        </div>
      </div>

      {/* Triage info */}
      {triageResult && (
        <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <span><strong>Intent:</strong> {triageResult.intent}</span>
            <span><strong>Category:</strong> {triageResult.category}</span>
            <span><strong>Priority:</strong> {triageResult.suggestedPriority}</span>
            <span><strong>Action:</strong> {triageResult.suggestedAction}</span>
          </div>
          {triageResult.flags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {triageResult.flags.map((flag, i) => (
                <span
                  key={i}
                  title={flag.description}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: flag.severity === 'HIGH' ? '#fef2f2' : flag.severity === 'MEDIUM' ? '#fff7ed' : '#f0fdf4',
                    color: flag.severity === 'HIGH' ? '#dc2626' : flag.severity === 'MEDIUM' ? '#ea580c' : '#16a34a',
                    border: `1px solid ${flag.severity === 'HIGH' ? '#fecaca' : flag.severity === 'MEDIUM' ? '#fed7aa' : '#bbf7d0'}`,
                  }}
                >
                  {flag.type}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compliance warnings */}
      {triageResult?.flags.some((f) => f.type === 'COMPLIANCE_RISK' || f.type === 'PHI_DETECTED' || f.type === 'PII_DETECTED') && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          <strong>Compliance Warning:</strong> This message contains sensitive information that may require special handling.
        </div>
      )}

      {/* Thread messages */}
      {item.threadMessages && item.threadMessages.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#6b7280' }}>
            Thread ({item.threadMessages.length} messages)
          </h3>
          {item.threadMessages.map((msg) => (
            <ThreadMessage key={msg.id} message={msg} />
          ))}
        </div>
      )}

      {/* Message body */}
      <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 24 }}>
        {message.body}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <button
          onClick={() => onGenerateDraft(message.id)}
          style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          Generate Draft
        </button>
        <button
          onClick={() => onReply(message.id)}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 13 }}
        >
          Reply
        </button>
        <button
          onClick={() => onStar(message.id)}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: item.isStarred ? '#fef3c7' : 'white', cursor: 'pointer', fontSize: 13 }}
        >
          {item.isStarred ? 'Unstar' : 'Star'}
        </button>
        <button
          onClick={() => setShowFollowUpPicker(!showFollowUpPicker)}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 13 }}
        >
          Follow Up
        </button>
        <button
          onClick={() => onArchive(message.id)}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 13, marginLeft: 'auto' }}
        >
          Archive
        </button>
      </div>

      {/* Follow-up date picker */}
      {showFollowUpPicker && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input
            type="datetime-local"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          />
          <button
            onClick={() => {
              if (followUpDate) {
                onFollowUp(message.id, new Date(followUpDate));
                setShowFollowUpPicker(false);
                setFollowUpDate('');
              }
            }}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: 13 }}
          >
            Set
          </button>
        </div>
      )}

      {/* Draft section */}
      {item.draft && (
        <DraftEditor
          draft={item.draft}
          onApproveAndSend={(body) => onSendDraft(message.id, body)}
          onSaveDraft={() => {}}
          onDiscard={() => {}}
          onRegenerate={() => onGenerateDraft(message.id)}
        />
      )}

      {/* Follow-up reminder */}
      {item.followUp && (
        <div style={{ padding: 12, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, marginTop: 16, fontSize: 13 }}>
          <strong>Follow-up Reminder:</strong> {item.followUp.reason} — {new Date(item.followUp.reminderAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
