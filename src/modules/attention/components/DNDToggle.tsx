'use client';

import React from 'react';
import type { DNDConfig } from '../types';

interface Props {
  config: DNDConfig;
  onChange: (config: DNDConfig) => void;
}

export function DNDToggle({ config, onChange }: Props) {
  const modes: DNDConfig['mode'][] = ['MANUAL', 'FOCUS_HOURS', 'CALENDAR_AWARE', 'SMART'];

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 600 }}>Do Not Disturb</span>
        <button
          onClick={() => onChange({ ...config, isActive: !config.isActive })}
          style={{
            padding: '4px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            backgroundColor: config.isActive ? '#ef4444' : '#22c55e',
            color: 'white', fontWeight: 500,
          }}
        >
          {config.isActive ? 'ON' : 'OFF'}
        </button>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Mode</label>
        <select
          value={config.mode}
          onChange={(e) => onChange({ ...config, mode: e.target.value as DNDConfig['mode'] })}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
        >
          {modes.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>
      {config.mode === 'FOCUS_HOURS' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Start</label>
            <input
              type="time" value={config.startTime || ''}
              onChange={(e) => onChange({ ...config, startTime: e.target.value })}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>End</label>
            <input
              type="time" value={config.endTime || ''}
              onChange={(e) => onChange({ ...config, endTime: e.target.value })}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>
      )}
      <div style={{ marginTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input
            type="checkbox" checked={config.vipBreakthroughEnabled}
            onChange={(e) => onChange({ ...config, vipBreakthroughEnabled: e.target.checked })}
          />
          Allow VIP breakthrough
        </label>
      </div>
    </div>
  );
}
