'use client';

import React, { useState } from 'react';
import type { Tone } from '@/shared/types';
import type { DraftResponse } from '../inbox.types';

interface DraftEditorProps {
  draft: DraftResponse;
  onApproveAndSend: (body: string) => void;
  onSaveDraft: (body: string) => void;
  onDiscard: () => void;
  onRegenerate: (tone?: Tone) => void;
}

const TONES: Tone[] = [
  'FORMAL', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FIRM', 'EMPATHETIC', 'AUTHORITATIVE',
];

export function DraftEditor({
  draft,
  onApproveAndSend,
  onSaveDraft,
  onDiscard,
  onRegenerate,
}: DraftEditorProps) {
  const [body, setBody] = useState(draft.draftBody);
  const [selectedTone, setSelectedTone] = useState<Tone>(draft.tone);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(
    draft.complianceNotes.length > 0
  );

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Draft Reply</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>Tone:</label>
          <select
            value={selectedTone}
            onChange={(e) => {
              setSelectedTone(e.target.value as Tone);
              onRegenerate(e.target.value as Tone);
            }}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12 }}
          >
            {TONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Subject suggestion */}
      {draft.suggestedSubject && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          Subject: {draft.suggestedSubject}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{
          width: '100%',
          minHeight: 180,
          padding: 12,
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 14,
          lineHeight: 1.5,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      {/* Character count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
        <span>{body.length} characters</span>
        <span>Confidence: {Math.round(draft.confidenceScore * 100)}%</span>
      </div>

      {/* Compliance disclaimer toggle */}
      {draft.complianceNotes.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showDisclaimer}
            onChange={(e) => setShowDisclaimer(e.target.checked)}
          />
          Include compliance disclaimer
        </label>
      )}

      {/* Alternatives */}
      {draft.alternatives.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            style={{
              background: 'none', border: 'none', color: '#3b82f6',
              cursor: 'pointer', fontSize: 13, padding: 0,
            }}
          >
            {showAlternatives ? 'Hide' : 'View'} Alternatives ({draft.alternatives.length})
          </button>
          {showAlternatives && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.alternatives.map((alt, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12, border: '1px solid #e5e7eb', borderRadius: 6,
                    background: '#f9fafb', fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                    {alt.tone}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{alt.body}</div>
                  <button
                    onClick={() => { setBody(alt.body); setSelectedTone(alt.tone); }}
                    style={{
                      marginTop: 8, padding: '4px 12px', border: '1px solid #3b82f6',
                      borderRadius: 4, background: 'white', color: '#3b82f6',
                      cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Use This
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={() => onApproveAndSend(body)}
          style={{
            padding: '8px 20px', borderRadius: 6, border: 'none',
            background: '#3b82f6', color: 'white', fontWeight: 600,
            cursor: 'pointer', fontSize: 14,
          }}
        >
          Approve & Send
        </button>
        <button
          onClick={() => onSaveDraft(body)}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
            background: 'white', color: '#374151', cursor: 'pointer', fontSize: 14,
          }}
        >
          Save Draft
        </button>
        <button
          onClick={() => onRegenerate(selectedTone)}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
            background: 'white', color: '#374151', cursor: 'pointer', fontSize: 14,
          }}
        >
          Regenerate
        </button>
        <button
          onClick={onDiscard}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #ef4444',
            background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 14,
            marginLeft: 'auto',
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
