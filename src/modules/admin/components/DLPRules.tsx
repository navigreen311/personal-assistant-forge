'use client';

import React, { useState } from 'react';
import type { DLPRule } from '../types';

interface Props {
  rules: DLPRule[];
  onDelete: (ruleId: string) => void;
  onCreate: (rule: Omit<DLPRule, 'id'>) => void;
}

const actionColors: Record<string, { bg: string; text: string }> = {
  BLOCK: { bg: '#fee2e2', text: '#991b1b' },
  WARN: { bg: '#fef3c7', text: '#92400e' },
  LOG: { bg: '#dbeafe', text: '#1e40af' },
  REDACT: { bg: '#ede9fe', text: '#5b21b6' },
};

export function DLPRules({ rules, onDelete, onCreate }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState('');
  const [action, setAction] = useState<DLPRule['action']>('WARN');
  const [scope, setScope] = useState<DLPRule['scope']>('ALL');

  const handleCreate = () => {
    onCreate({ entityId: '', name, pattern, action, scope, isActive: true });
    setName('');
    setPattern('');
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: '#6b7280' }}>{rules.length} rules configured</span>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          {showForm ? 'Cancel' : 'Add Rule'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Pattern</label>
              <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="regex or keyword" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value as DLPRule['action'])} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                <option value="BLOCK">Block</option>
                <option value="WARN">Warn</option>
                <option value="LOG">Log</option>
                <option value="REDACT">Redact</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value as DLPRule['scope'])} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                <option value="ALL">All</option>
                <option value="OUTBOUND_MESSAGES">Outbound Messages</option>
                <option value="DOCUMENTS">Documents</option>
              </select>
            </div>
          </div>
          <button onClick={handleCreate} style={{ padding: '8px 16px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Create Rule
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No DLP rules configured.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rules.map((rule) => {
            const colors = actionColors[rule.action] || actionColors.LOG;
            return (
              <div key={rule.id} style={{ padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{rule.name}</span>
                    <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '12px', fontSize: '11px', backgroundColor: colors.bg, color: colors.text }}>{rule.action}</span>
                    <span style={{ marginLeft: '4px', padding: '2px 6px', borderRadius: '12px', fontSize: '11px', backgroundColor: '#f3f4f6', color: '#6b7280' }}>{rule.scope}</span>
                  </div>
                  <button onClick={() => onDelete(rule.id)} style={{ padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px', backgroundColor: 'white', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>
                    Delete
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', fontFamily: 'monospace' }}>
                  Pattern: {rule.pattern}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
