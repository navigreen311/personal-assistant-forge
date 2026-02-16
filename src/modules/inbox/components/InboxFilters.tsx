'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { MessageChannel, Sensitivity } from '@/shared/types';
import type { InboxFilters as InboxFiltersType, MessageIntent } from '../inbox.types';

interface InboxFiltersProps {
  filters: InboxFiltersType;
  onFiltersChange: (filters: InboxFiltersType) => void;
}

const CHANNELS: MessageChannel[] = [
  'EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL',
];

const INTENTS: MessageIntent[] = [
  'INQUIRY', 'REQUEST', 'UPDATE', 'URGENT', 'FYI', 'COMPLAINT',
  'FOLLOW_UP', 'INTRODUCTION', 'SCHEDULING', 'FINANCIAL', 'APPROVAL', 'SOCIAL',
];

const SENSITIVITIES: Sensitivity[] = [
  'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'REGULATED',
];

export function InboxFilters({ filters, onFiltersChange }: InboxFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? '');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (filters.search ?? '')) {
        onFiltersChange({ ...filters, search: search || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters, onFiltersChange]);

  const updateFilter = useCallback(
    (key: keyof InboxFiltersType, value: unknown) => {
      onFiltersChange({ ...filters, [key]: value || undefined });
    },
    [filters, onFiltersChange]
  );

  const clearAll = useCallback(() => {
    setSearch('');
    onFiltersChange({});
  }, [onFiltersChange]);

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined
  ).length;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
      {/* Search */}
      <input
        type="text"
        placeholder="Search messages..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 14,
          marginBottom: 8,
        }}
      />

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filters.channel ?? ''}
          onChange={(e) => updateFilter('channel', e.target.value as MessageChannel)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
        >
          <option value="">All Channels</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>

        <select
          value={filters.intent ?? ''}
          onChange={(e) => updateFilter('intent', e.target.value as MessageIntent)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
        >
          <option value="">All Intents</option>
          {INTENTS.map((intent) => (
            <option key={intent} value={intent}>{intent}</option>
          ))}
        </select>

        <select
          value={filters.sensitivity ?? ''}
          onChange={(e) => updateFilter('sensitivity', e.target.value as Sensitivity)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
        >
          <option value="">All Sensitivity</option>
          {SENSITIVITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Urgency range */}
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          Score:
          <input
            type="number"
            min={1}
            max={10}
            value={filters.minTriageScore ?? ''}
            onChange={(e) => updateFilter('minTriageScore', e.target.value ? Number(e.target.value) : undefined)}
            style={{ width: 48, padding: '4px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
            placeholder="Min"
          />
          -
          <input
            type="number"
            min={1}
            max={10}
            value={filters.maxTriageScore ?? ''}
            onChange={(e) => updateFilter('maxTriageScore', e.target.value ? Number(e.target.value) : undefined)}
            style={{ width: 48, padding: '4px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
            placeholder="Max"
          />
        </label>

        {/* Date range */}
        <input
          type="date"
          value={filters.dateFrom ? filters.dateFrom.toISOString().split('T')[0] : ''}
          onChange={(e) => updateFilter('dateFrom', e.target.value ? new Date(e.target.value) : undefined)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
        />
        <input
          type="date"
          value={filters.dateTo ? filters.dateTo.toISOString().split('T')[0] : ''}
          onChange={(e) => updateFilter('dateTo', e.target.value ? new Date(e.target.value) : undefined)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
        />

        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid #ef4444',
              background: '#fef2f2',
              color: '#ef4444',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Clear All ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {Object.entries(filters)
            .filter(([, v]) => v !== undefined)
            .map(([key, value]) => (
              <span
                key={key}
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  fontSize: 11,
                  color: '#1d4ed8',
                }}
              >
                {key}: {value instanceof Date ? value.toLocaleDateString() : String(value)}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
