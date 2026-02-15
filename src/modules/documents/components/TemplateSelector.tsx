'use client';

import React, { useState } from 'react';
import type { DocumentTemplate } from '../types';

interface Props {
  templates: DocumentTemplate[];
  onSelect: (id: string) => void;
}

export function TemplateSelector({ templates, onSelect }: Props) {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const types = Array.from(new Set(templates.map((t) => t.type)));
  const categories = Array.from(new Set(templates.map((t) => t.category)));

  const filtered = templates.filter((t) => {
    if (typeFilter && t.type !== typeFilter) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
          <option value="">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
        {filtered.map((template) => (
          <button key={template.id} onClick={() => onSelect(template.id)} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', backgroundColor: 'white' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{template.name}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>{template.type} &middot; {template.category}</div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>{template.variables.length} variables &middot; v{template.version}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
