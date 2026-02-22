'use client';

import React, { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------
type PriorityFilter = 'All' | 'P0 only' | 'P0+P1' | 'P0+P1+P2';
type DigestChannel = 'Email' | 'Push' | 'Both';
type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

interface ChannelRow {
  channel: string;
  enabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursEnabled: boolean;
  priorityFilter: PriorityFilter;
}

interface ModuleRuleRow {
  module: string;
  notifyOn: string;
  channel: string;
  batch: boolean;
}

interface DigestConfig {
  dailyTime: string;
  dailyChannel: DigestChannel;
  dailyContents: string;
  includeAISummary: boolean;
  weeklyDay: Weekday;
  weeklyTime: string;
  weeklyChannel: DigestChannel;
}

interface NotificationSettings {
  channels: ChannelRow[];
  moduleRules: ModuleRuleRow[];
  digest: DigestConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_CHANNELS: ChannelRow[] = [
  { channel: 'Push', enabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00', quietHoursEnabled: true, priorityFilter: 'All' },
  { channel: 'Email digest', enabled: true, quietHoursStart: '', quietHoursEnd: '', quietHoursEnabled: false, priorityFilter: 'All' },
  { channel: 'SMS', enabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursEnabled: true, priorityFilter: 'P0 only' },
  { channel: 'Desktop', enabled: true, quietHoursStart: '20:00', quietHoursEnd: '09:00', quietHoursEnabled: true, priorityFilter: 'P0+P1' },
  { channel: 'In-app', enabled: true, quietHoursStart: '', quietHoursEnd: '', quietHoursEnabled: false, priorityFilter: 'All' },
];

const DEFAULT_MODULE_RULES: ModuleRuleRow[] = [
  { module: 'Inbox', notifyOn: 'New message, VIP reply', channel: 'Push', batch: true },
  { module: 'Calendar', notifyOn: 'Event in 10 min, changes', channel: 'Desktop', batch: false },
  { module: 'Tasks', notifyOn: 'Due soon, assigned to me', channel: 'Push', batch: true },
  { module: 'VoiceForge', notifyOn: 'Transcription ready', channel: 'In-app', batch: true },
  { module: 'Finance', notifyOn: 'Budget alert, bill due', channel: 'Email digest', batch: false },
  { module: 'Workflows', notifyOn: 'Step completed, error', channel: 'Push', batch: true },
];

const DEFAULT_DIGEST: DigestConfig = {
  dailyTime: '08:00',
  dailyChannel: 'Email',
  dailyContents: 'Summarises overnight notifications, top priorities, and pending actions.',
  includeAISummary: true,
  weeklyDay: 'Monday',
  weeklyTime: '09:00',
  weeklyChannel: 'Both',
};

const PRIORITY_FILTERS: PriorityFilter[] = ['All', 'P0 only', 'P0+P1', 'P0+P1+P2'];
const CHANNEL_OPTIONS = ['Push', 'Email digest', 'SMS', 'Desktop', 'In-app'];
const DIGEST_CHANNEL_OPTIONS: DigestChannel[] = ['Email', 'Push', 'Both'];
const WEEKDAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const sectionStyle: React.CSSProperties = {
  padding: '16px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginBottom: '16px',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '2px solid #e5e7eb',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '14px',
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  fontSize: '13px',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  fontSize: '13px',
};

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
  fontSize: '13px',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '14px',
};

const skeletonBlock = (width: string, height = '16px'): React.CSSProperties => ({
  width,
  height,
  backgroundColor: '#e5e7eb',
  borderRadius: '4px',
  animation: 'pulse 1.5s ease-in-out infinite',
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function NotificationsTab({ entityId, period }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<ChannelRow[]>(DEFAULT_CHANNELS);
  const [moduleRules, setModuleRules] = useState<ModuleRuleRow[]>(DEFAULT_MODULE_RULES);
  const [digest, setDigest] = useState<DigestConfig>(DEFAULT_DIGEST);
  const [editingModuleIndex, setEditingModuleIndex] = useState<number | null>(null);

  // Simulate fetching notification preferences
  useEffect(() => {
    const timer = setTimeout(() => {
      // In production: GET /api/attention/notifications?entityId=...&period=...
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [entityId, period]);

  // Channel handlers
  const updateChannel = (index: number, updates: Partial<ChannelRow>) => {
    setChannels((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
    );
  };

  // Module-rule handlers
  const updateModuleRule = (index: number, updates: Partial<ModuleRuleRow>) => {
    setModuleRules((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
    );
  };

  // Save handler (placeholder)
  const handleSave = async () => {
    setSaving(true);
    try {
      // Placeholder: PUT /api/attention/notifications
      const _payload: NotificationSettings = { channels, moduleRules, digest };
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setSaving(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={sectionStyle}>
          <div style={skeletonBlock('220px', '20px')} />
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} style={{ display: 'flex', gap: '16px' }}>
                <div style={skeletonBlock('100px')} />
                <div style={skeletonBlock('40px')} />
                <div style={skeletonBlock('120px')} />
                <div style={skeletonBlock('80px')} />
              </div>
            ))}
          </div>
        </div>
        <div style={sectionStyle}>
          <div style={skeletonBlock('260px', '20px')} />
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} style={{ display: 'flex', gap: '16px' }}>
                <div style={skeletonBlock('100px')} />
                <div style={skeletonBlock('160px')} />
                <div style={skeletonBlock('80px')} />
                <div style={skeletonBlock('40px')} />
              </div>
            ))}
          </div>
        </div>
        <div style={sectionStyle}>
          <div style={skeletonBlock('180px', '20px')} />
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={skeletonBlock('100%', '32px')} />
            <div style={skeletonBlock('100%', '32px')} />
          </div>
        </div>
      </div>
    );
  }

  // Render
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Notification Preferences</h2>

      {/* CHANNELS */}
      <div style={sectionStyle}>
        <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Channels</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Channel</th>
                <th style={thStyle}>Enabled</th>
                <th style={thStyle}>Quiet Hours</th>
                <th style={thStyle}>Priority Filter</th>
              </tr>
            </thead>
            <tbody>
              {channels?.map((row, idx) => (
                <tr key={row?.channel}>
                  <td style={tdStyle}>{row?.channel}</td>

                  {/* Toggle switch */}
                  <td style={tdStyle}>
                    <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                      <input
                        type="checkbox"
                        checked={row?.enabled ?? false}
                        onChange={(e) => updateChannel(idx, { enabled: e.target.checked })}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: row?.enabled ? '#2563eb' : '#d1d5db',
                          borderRadius: '11px',
                          transition: 'background-color 0.2s',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            height: '16px',
                            width: '16px',
                            left: row?.enabled ? '20px' : '3px',
                            bottom: '3px',
                            backgroundColor: '#ffffff',
                            borderRadius: '50%',
                            transition: 'left 0.2s',
                          }}
                        />
                      </span>
                    </label>
                  </td>

                  {/* Quiet Hours */}
                  <td style={tdStyle}>
                    {row?.quietHoursEnabled ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="time"
                          value={row?.quietHoursStart ?? ''}
                          onChange={(e) => updateChannel(idx, { quietHoursStart: e.target.value })}
                          style={{ ...inputStyle, width: '100px' }}
                        />
                        <span style={{ color: '#6b7280' }}>{'–'}</span>
                        <input
                          type="time"
                          value={row?.quietHoursEnd ?? ''}
                          onChange={(e) => updateChannel(idx, { quietHoursEnd: e.target.value })}
                          style={{ ...inputStyle, width: '100px' }}
                        />
                        <button
                          style={{ ...btnStyle, fontSize: '11px', color: '#ef4444' }}
                          onClick={() => updateChannel(idx, { quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '' })}
                        >
                          Clear
                        </button>
                      </span>
                    ) : (
                      <button
                        style={{ ...btnStyle, fontSize: '12px' }}
                        onClick={() => updateChannel(idx, { quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' })}
                      >
                        Never quiet {'—'} Set hours
                      </button>
                    )}
                  </td>

                  {/* Priority Filter */}
                  <td style={tdStyle}>
                    <select
                      value={row?.priorityFilter ?? 'All'}
                      onChange={(e) => updateChannel(idx, { priorityFilter: e.target.value as PriorityFilter })}
                      style={selectStyle}
                    >
                      {PRIORITY_FILTERS.map((pf) => (
                        <option key={pf} value={pf}>{pf}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOTIFICATION RULES BY MODULE */}
      <div style={sectionStyle}>
        <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Notification Rules by Module</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Module</th>
                <th style={thStyle}>Notify on</th>
                <th style={thStyle}>Channel</th>
                <th style={thStyle}>Batch?</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {moduleRules?.map((rule, idx) => {
                const isEditing = editingModuleIndex === idx;
                return (
                  <tr key={rule?.module}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{rule?.module}</td>

                    {/* Notify on */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={rule?.notifyOn ?? ''}
                          onChange={(e) => updateModuleRule(idx, { notifyOn: e.target.value })}
                          style={{ ...inputStyle, width: '100%', minWidth: '180px' }}
                        />
                      ) : (
                        <span style={{ fontSize: '13px', color: '#4b5563' }}>{rule?.notifyOn}</span>
                      )}
                    </td>

                    {/* Channel */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select
                          value={rule?.channel ?? 'Push'}
                          onChange={(e) => updateModuleRule(idx, { channel: e.target.value })}
                          style={selectStyle}
                        >
                          {CHANNEL_OPTIONS.map((ch) => (
                            <option key={ch} value={ch}>{ch}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: '13px' }}>{rule?.channel}</span>
                      )}
                    </td>

                    {/* Batch */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={rule?.batch ?? false}
                          onChange={(e) => updateModuleRule(idx, { batch: e.target.checked })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      ) : (
                        <span style={{ fontSize: '13px' }}>{rule?.batch ? 'Yes' : 'No'}</span>
                      )}
                    </td>

                    {/* Edit / Done */}
                    <td style={tdStyle}>
                      <button
                        style={{ ...btnStyle, color: isEditing ? '#2563eb' : '#6b7280' }}
                        onClick={() => setEditingModuleIndex(isEditing ? null : idx)}
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DIGEST CONFIGURATION */}
      <div style={sectionStyle}>
        <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Digest Configuration</h3>

        {/* Daily digest */}
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontWeight: 500, marginBottom: '8px', fontSize: '14px', color: '#374151' }}>Daily Digest</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              Time:
              <input
                type="time"
                value={digest?.dailyTime ?? '08:00'}
                onChange={(e) => setDigest((prev) => ({ ...prev, dailyTime: e.target.value }))}
                style={{ ...inputStyle, width: '110px' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              Channel:
              <select
                value={digest?.dailyChannel ?? 'Email'}
                onChange={(e) => setDigest((prev) => ({ ...prev, dailyChannel: e.target.value as DigestChannel }))}
                style={selectStyle}
              >
                {DIGEST_CHANNEL_OPTIONS.map((ch) => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </label>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px 0' }}>
            {digest?.dailyContents}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={digest?.includeAISummary ?? false}
              onChange={(e) => setDigest((prev) => ({ ...prev, includeAISummary: e.target.checked }))}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Include AI summary of what happened overnight
          </label>
        </div>

        {/* Weekly digest */}
        <div>
          <h4 style={{ fontWeight: 500, marginBottom: '8px', fontSize: '14px', color: '#374151' }}>Weekly Digest</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              Day:
              <select
                value={digest?.weeklyDay ?? 'Monday'}
                onChange={(e) => setDigest((prev) => ({ ...prev, weeklyDay: e.target.value as Weekday }))}
                style={selectStyle}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              Time:
              <input
                type="time"
                value={digest?.weeklyTime ?? '09:00'}
                onChange={(e) => setDigest((prev) => ({ ...prev, weeklyTime: e.target.value }))}
                style={{ ...inputStyle, width: '110px' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              Channel:
              <select
                value={digest?.weeklyChannel ?? 'Both'}
                onChange={(e) => setDigest((prev) => ({ ...prev, weeklyChannel: e.target.value as DigestChannel }))}
                style={selectStyle}
              >
                {DIGEST_CHANNEL_OPTIONS.map((ch) => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          style={{
            ...saveBtnStyle,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
