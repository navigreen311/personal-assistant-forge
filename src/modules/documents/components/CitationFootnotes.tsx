'use client';

import React from 'react';
import type { Citation } from '@/shared/types';

interface Props {
  citations: Citation[];
}

export function CitationFootnotes({ citations }: Props) {
  if (citations.length === 0) return null;

  return (
    <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
      <h4 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>Citations</h4>
      <ol style={{ paddingLeft: '20px', fontSize: '12px', color: '#6b7280' }}>
        {citations.map((citation, i) => (
          <li key={citation.id} style={{ marginBottom: '4px' }}>
            [{i + 1}] {citation.excerpt} <span style={{ fontStyle: 'italic' }}>({citation.sourceType}: {citation.sourceId})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
