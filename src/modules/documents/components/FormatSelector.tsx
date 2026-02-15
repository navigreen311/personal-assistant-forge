'use client';

import React from 'react';

interface Props {
  selected: string;
  onChange: (format: string) => void;
}

const formats = ['DOCX', 'PDF', 'MARKDOWN', 'HTML'] as const;

export function FormatSelector({ selected, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {formats.map((format) => (
        <label key={format} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: '2px solid', borderColor: selected === format ? '#3b82f6' : '#e5e7eb', borderRadius: '8px', cursor: 'pointer', backgroundColor: selected === format ? '#eff6ff' : 'white' }}>
          <input type="radio" name="format" value={format} checked={selected === format} onChange={() => onChange(format)} style={{ display: 'none' }} />
          <span style={{ fontWeight: selected === format ? 600 : 400 }}>{format}</span>
        </label>
      ))}
    </div>
  );
}
