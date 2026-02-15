'use client';

import React, { useState } from 'react';
import type { DocumentTemplate } from '../types';

interface Props {
  template: DocumentTemplate;
  onGenerate: (vars: Record<string, string>) => void;
}

export function DocumentEditor({ template, onGenerate }: Props) {
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of template.variables) {
      initial[v.name] = v.defaultValue || '';
    }
    return initial;
  });

  const preview = template.content.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      <div>
        <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Variables</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {template.variables.map((v) => (
            <div key={v.name}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                {v.label} {v.required && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              {v.type === 'SELECT' && v.options ? (
                <select value={variables[v.name]} onChange={(e) => setVariables({ ...variables, [v.name]: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                  <option value="">Select...</option>
                  {v.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={v.type === 'DATE' ? 'date' : v.type === 'NUMBER' ? 'number' : 'text'} value={variables[v.name]} onChange={(e) => setVariables({ ...variables, [v.name]: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
              )}
            </div>
          ))}
        </div>
        <button onClick={() => onGenerate(variables)} style={{ marginTop: '16px', padding: '10px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Generate Document
        </button>
      </div>
      <div>
        <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Preview</h3>
        <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', whiteSpace: 'pre-wrap', fontFamily: 'serif', lineHeight: '1.6' }}>
          {preview}
        </div>
      </div>
    </div>
  );
}
