'use client';

import React, { useState } from 'react';
import type { CustomToolDefinition } from '../types';

interface Props {
  tool?: CustomToolDefinition;
  onSave: (tool: Omit<CustomToolDefinition, 'id'>) => void;
}

export function CustomToolEditor({ tool, onSave }: Props) {
  const [name, setName] = useState(tool?.name || '');
  const [description, setDescription] = useState(tool?.description || '');
  const [implementation, setImplementation] = useState<CustomToolDefinition['implementation']>(tool?.implementation || 'WEBHOOK');
  const [inputSchema, setInputSchema] = useState(tool ? JSON.stringify(tool.inputSchema, null, 2) : '{}');
  const [outputSchema, setOutputSchema] = useState(tool ? JSON.stringify(tool.outputSchema, null, 2) : '{}');

  const handleSave = () => {
    onSave({
      entityId: tool?.entityId || '',
      name,
      description,
      inputSchema: JSON.parse(inputSchema),
      outputSchema: JSON.parse(outputSchema),
      implementation,
      config: tool?.config || {},
      isActive: tool?.isActive ?? true,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Implementation</label>
        <select value={implementation} onChange={(e) => setImplementation(e.target.value as CustomToolDefinition['implementation'])} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
          <option value="WEBHOOK">Webhook</option>
          <option value="FUNCTION">Function</option>
          <option value="API_CALL">API Call</option>
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Input Schema (JSON)</label>
        <textarea value={inputSchema} onChange={(e) => setInputSchema(e.target.value)} rows={4} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontFamily: 'monospace' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Output Schema (JSON)</label>
        <textarea value={outputSchema} onChange={(e) => setOutputSchema(e.target.value)} rows={4} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontFamily: 'monospace' }} />
      </div>
      <button onClick={handleSave} style={{ padding: '10px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, alignSelf: 'flex-start' }}>
        Save Tool
      </button>
    </div>
  );
}
