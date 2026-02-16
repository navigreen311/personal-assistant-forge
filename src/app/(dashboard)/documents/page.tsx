'use client';

import React, { useState, useEffect } from 'react';
import type { DocumentTemplate } from '@/modules/documents/types';
import { TemplateSelector } from '@/modules/documents/components/TemplateSelector';
import { FormatSelector } from '@/modules/documents/components/FormatSelector';

type View = 'templates' | 'editor' | 'versions';

export default function DocumentsPage() {
  const [view, setView] = useState<View>('templates');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState('MARKDOWN');

  useEffect(() => {
    fetch('/api/documents/templates')
      .then((res) => res.json())
      .then((data) => { if (data.success && data.data) setTemplates(data.data); })
      .catch(() => {});
  }, []);

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setView('editor');
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Document Studio</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setView('templates')}
            style={{
              padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
              backgroundColor: view === 'templates' ? '#3b82f6' : 'white',
              color: view === 'templates' ? 'white' : '#374151',
            }}
          >
            Templates
          </button>
          <button
            onClick={() => setView('versions')}
            style={{
              padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
              backgroundColor: view === 'versions' ? '#3b82f6' : 'white',
              color: view === 'versions' ? 'white' : '#374151',
            }}
          >
            Versions
          </button>
        </div>
      </div>

      {view === 'templates' && (
        <TemplateSelector templates={templates} onSelect={handleSelectTemplate} />
      )}

      {view === 'editor' && selectedTemplate && (
        <div>
          <button
            onClick={() => setView('templates')}
            style={{ marginBottom: '16px', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'white' }}
          >
            Back to Templates
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>{selectedTemplate.name}</h2>
          <div style={{ marginBottom: '16px' }}>
            <FormatSelector selected={outputFormat} onChange={setOutputFormat} />
          </div>
          <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ color: '#6b7280' }}>
              Template editor with {selectedTemplate.variables.length} variables.
              Fill in the form below to generate your document.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              {selectedTemplate.variables.map((v) => (
                <div key={v.name}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                    {v.label} {v.required && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <input
                    type={v.type === 'DATE' ? 'date' : v.type === 'NUMBER' ? 'number' : 'text'}
                    placeholder={v.defaultValue || ''}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  />
                </div>
              ))}
            </div>
            <button style={{
              marginTop: '16px', padding: '10px 24px', backgroundColor: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500,
            }}>
              Generate Document
            </button>
          </div>
        </div>
      )}

      {view === 'versions' && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          Select a document to view its version history.
        </div>
      )}
    </div>
  );
}
