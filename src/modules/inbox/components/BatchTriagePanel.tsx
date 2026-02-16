'use client';

import React, { useState } from 'react';
import type { BatchTriageResult } from '../inbox.types';

interface BatchTriagePanelProps {
  selectedIds: string[];
  entityId: string;
  onTriageSelected: (entityId: string, messageIds: string[]) => Promise<BatchTriageResult | null>;
  onTriageAll: (entityId: string) => Promise<BatchTriageResult | null>;
  onArchiveLowPriority: () => void;
  onFlagUrgent: () => void;
}

export function BatchTriagePanel({
  selectedIds,
  entityId,
  onTriageSelected,
  onTriageAll,
  onArchiveLowPriority,
  onFlagUrgent,
}: BatchTriagePanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchTriageResult | null>(null);

  const handleTriageSelected = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const res = await onTriageSelected(entityId, selectedIds);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleTriageAll = async () => {
    setLoading(true);
    try {
      const res = await onTriageAll(entityId);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>Batch Triage</h3>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          onClick={handleTriageSelected}
          disabled={loading || selectedIds.length === 0}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: selectedIds.length === 0 ? '#d1d5db' : '#3b82f6',
            color: 'white', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >
          Triage Selected ({selectedIds.length})
        </button>
        <button
          onClick={handleTriageAll}
          disabled={loading}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #3b82f6',
            background: 'white', color: '#3b82f6', cursor: 'pointer', fontSize: 13,
          }}
        >
          Triage All Untriaged
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: 12, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Processing messages...
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 12, background: '#fef2f2', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{result.summary.urgent}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Urgent</div>
            </div>
            <div style={{ padding: 12, background: '#fff7ed', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#ea580c' }}>{result.summary.needsResponse}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Needs Response</div>
            </div>
            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{result.summary.canArchive}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Can Archive</div>
            </div>
            <div style={{ padding: 12, background: '#eff6ff', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>{result.summary.flagged}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Flagged</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
            Processed {result.processed} messages in {result.processingTimeMs}ms
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onArchiveLowPriority}
              style={{
                padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db',
                background: 'white', cursor: 'pointer', fontSize: 12,
              }}
            >
              Archive All Low Priority
            </button>
            <button
              onClick={onFlagUrgent}
              style={{
                padding: '6px 12px', borderRadius: 4, border: '1px solid #ef4444',
                background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12,
              }}
            >
              Flag All Urgent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
