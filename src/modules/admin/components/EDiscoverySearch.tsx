'use client';

import React, { useState } from 'react';
import type { EDiscoveryExport } from '../types';

interface Props {
  exports: EDiscoveryExport[];
  onRequest: (dateRange: { start: Date; end: Date }, dataTypes: string[]) => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af' },
  COMPLETE: { bg: '#dcfce7', text: '#166534' },
  FAILED: { bg: '#fee2e2', text: '#991b1b' },
};

const dataTypeOptions = ['messages', 'documents', 'tasks', 'calendar', 'contacts', 'action_logs'];

export function EDiscoverySearch({ exports, onRequest }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);
  };

  const handleRequest = () => {
    if (!startDate || !endDate || selectedTypes.length === 0) return;
    onRequest({ start: new Date(startDate), end: new Date(endDate) }, selectedTypes);
    setShowForm(false);
    setStartDate('');
    setEndDate('');
    setSelectedTypes([]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: '#6b7280' }}>{exports.length} export requests</span>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          {showForm ? 'Cancel' : 'New Export'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>Data Types</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {dataTypeOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={{
                    padding: '4px 12px', borderRadius: '16px', fontSize: '13px', cursor: 'pointer',
                    border: '1px solid #d1d5db',
                    backgroundColor: selectedTypes.includes(type) ? '#3b82f6' : 'white',
                    color: selectedTypes.includes(type) ? 'white' : '#374151',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleRequest} style={{ padding: '8px 16px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Request Export
          </button>
        </div>
      )}

      {exports.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No export requests yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {exports.map((exp) => {
            const colors = statusColors[exp.status] || statusColors.PENDING;
            return (
              <div key={exp.id} style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600 }}>Export #{exp.id.slice(0, 8)}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', backgroundColor: colors.bg, color: colors.text }}>
                    {exp.status}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {new Date(exp.dateRange.start).toLocaleDateString()} - {new Date(exp.dateRange.end).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  {exp.dataTypes.map((dt) => (
                    <span key={dt} style={{ padding: '1px 6px', backgroundColor: '#f3f4f6', borderRadius: '4px', fontSize: '11px' }}>{dt}</span>
                  ))}
                </div>
                {exp.downloadUrl && (
                  <div style={{ marginTop: '8px' }}>
                    <a href={exp.downloadUrl} style={{ color: '#3b82f6', fontSize: '13px' }}>Download</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
