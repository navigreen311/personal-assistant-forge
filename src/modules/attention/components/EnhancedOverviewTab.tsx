'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { AttentionBudget, DNDConfig } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Extended local types for enhanced UI (augmenting core types)
// ---------------------------------------------------------------------------
interface BudgetResponse {
  budget: AttentionBudget;
  interruptions?: InterruptionEntry[];
  byPriority?: {
    critical?: { used: number; limit: number };
    high?: { used: number; limit: number };
    normal?: { used: number; limit: number };
  };
}

interface InterruptionEntry {
  id: string;
  time: string;
  type: string;
  source: string;
  priority: 'P0' | 'P1' | 'P2';
  actionTaken: string;
}

interface ExtendedDNDConfig extends DNDConfig {
  scheduleDays?: string[];
  allowCrisisAlerts?: boolean;
  allowStarredCalls?: boolean;
  whenActiveBehavior?: 'QUEUE' | 'BATCH_DIGEST' | 'DROP_SILENT';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DND_MODES: { value: ExtendedDNDConfig['mode']; label: string }[] = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'CALENDAR_AWARE', label: 'Calendar-aware' },
  { value: 'FOCUS_HOURS', label: 'Schedule' },
  { value: 'SMART', label: 'Focus' },
];

const WHEN_ACTIVE_OPTIONS: { value: NonNullable<ExtendedDNDConfig['whenActiveBehavior']>; label: string }[] = [
  { value: 'QUEUE', label: 'Queue for later' },
  { value: 'BATCH_DIGEST', label: 'Batch into digest' },
  { value: 'DROP_SILENT', label: 'Drop silently' },
];

const TYPE_EMOJI: Record<string, string> = {
  notification: '🔔',
  call: '📞',
  message: '💬',
  email: '📧',
  calendar: '📅',
  alert: '⚠️',
  system: '⚙️',
};

const PRIORITY_BADGE_STYLES: Record<string, React.CSSProperties> = {
  P0: { backgroundColor: '#fecaca', color: '#991b1b', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 },
  P1: { backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 },
  P2: { backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 },
};
// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------
function SkeletonBlock({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        height: `${height}px`,
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function SectionSkeleton({ height }: { height?: number }) {
  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <SkeletonBlock height={height} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Priority Row (for budget breakdown)
// ---------------------------------------------------------------------------
function PriorityRow({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      <span style={{ fontSize: '14px', minWidth: '60px', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '14px', color: '#6b7280' }}>
        {used} / {limit}
      </span>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function EnhancedOverviewTab({ entityId, period }: Props) {
  // Budget state
  const [budgetData, setBudgetData] = useState<BudgetResponse | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number>(10);

  // DND state
  const [dndConfig, setDndConfig] = useState<ExtendedDNDConfig | null>(null);
  const [dndLoading, setDndLoading] = useState(true);
  const [dndError, setDndError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch budget data
  // ---------------------------------------------------------------------------
  const fetchBudget = useCallback(async () => {
    setBudgetLoading(true);
    setBudgetError(null);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);
      const qs = params.toString();
      const res = await fetch(`/api/attention/budget${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`Budget fetch failed (${res.status})`);
      const json = await res.json();
      const data: BudgetResponse = json.data ?? json;
      setBudgetData(data);
      setDailyLimit(data?.budget?.dailyBudget ?? 10);
    } catch (err: unknown) {
      setBudgetError(err instanceof Error ? err.message : 'Failed to load budget');
    } finally {
      setBudgetLoading(false);
    }
  }, [entityId, period]);

  // ---------------------------------------------------------------------------
  // Fetch DND config
  // ---------------------------------------------------------------------------
  const fetchDND = useCallback(async () => {
    setDndLoading(true);
    setDndError(null);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      const qs = params.toString();
      const res = await fetch(`/api/attention/dnd${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`DND fetch failed (${res.status})`);
      const json = await res.json();
      const data: ExtendedDNDConfig = json.data ?? json;
      setDndConfig(data);
    } catch (err: unknown) {
      setDndError(err instanceof Error ? err.message : 'Failed to load DND config');
    } finally {
      setDndLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchBudget();
    fetchDND();
  }, [fetchBudget, fetchDND]);

  // ---------------------------------------------------------------------------
  // DND mutation helper
  // ---------------------------------------------------------------------------
  const updateDND = async (updates: Partial<ExtendedDNDConfig>) => {
    const next = { ...dndConfig, ...updates } as ExtendedDNDConfig;
    setDndConfig(next);
    try {
      const res = await fetch('/api/attention/dnd', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`DND update failed (${res.status})`);
    } catch (err: unknown) {
      setDndError(err instanceof Error ? err.message : 'Failed to update DND');
    }
  };
  // ---------------------------------------------------------------------------
  // Budget helpers
  // ---------------------------------------------------------------------------
  const budget = budgetData?.budget;
  const remaining = budget?.remaining ?? 0;
  const total = budget?.dailyBudget ?? 1;
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  const meterColor = percentage > 50 ? '#22c55e' : percentage > 25 ? '#f59e0b' : '#ef4444';

  const byPriority = budgetData?.byPriority;
  const interruptions = budgetData?.interruptions ?? [];

  // ---------------------------------------------------------------------------
  // Render: Attention Budget Section
  // ---------------------------------------------------------------------------
  const renderBudgetSection = () => {
    if (budgetLoading) return <SectionSkeleton height={180} />;
    if (budgetError) {
      return (
        <div style={{ padding: '16px', border: '1px solid #fecaca', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#991b1b' }}>
          {budgetError}
        </div>
      );
    }

    return (
      <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '16px' }}>
          Attention Budget
        </h3>

        {/* Budget meter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontWeight: 500 }}>Budget</span>
          <span style={{ fontWeight: 600, color: meterColor }}>
            {remaining} / {total} remaining
          </span>
        </div>
        <div style={{ width: '100%', height: '10px', backgroundColor: '#e5e7eb', borderRadius: '5px', marginBottom: '8px' }}>
          <div
            style={{
              width: `${Math.min(percentage, 100)}%`,
              height: '100%',
              backgroundColor: meterColor,
              borderRadius: '5px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
          Used today: {budget?.usedToday ?? 0} interruptions
        </div>

        {/* Budget config: daily limit dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <label style={{ fontSize: '14px', fontWeight: 500 }}>Daily interruption limit</label>
          <select
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #d1d5db' }}
          >
            {[5, 8, 10, 15, 20, 25, 30].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* By priority consumed */}
        <div style={{ marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>By priority consumed</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <PriorityRow label="Critical" used={byPriority?.critical?.used ?? 0} limit={byPriority?.critical?.limit ?? 3} color="#ef4444" />
          <PriorityRow label="High" used={byPriority?.high?.used ?? 0} limit={byPriority?.high?.limit ?? 4} color="#f59e0b" />
          <PriorityRow label="Normal" used={byPriority?.normal?.used ?? 0} limit={byPriority?.normal?.limit ?? 3} color="#3b82f6" />
        </div>

        <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
          Overflow → batched digest
        </div>
      </div>
    );
  };
  // ---------------------------------------------------------------------------
  // Render: Do Not Disturb Section
  // ---------------------------------------------------------------------------
  const renderDNDSection = () => {
    if (dndLoading) return <SectionSkeleton height={200} />;
    if (dndError && !dndConfig) {
      return (
        <div style={{ padding: '16px', border: '1px solid #fecaca', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#991b1b' }}>
          {dndError}
        </div>
      );
    }

    const isActive = dndConfig?.isActive ?? false;
    const mode = dndConfig?.mode ?? 'MANUAL';

    return (
      <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '16px' }}>
          Do Not Disturb
        </h3>

        {/* Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontWeight: 500 }}>Status</span>
          <button
            onClick={() => updateDND({ isActive: !isActive })}
            style={{
              padding: '6px 20px',
              borderRadius: '20px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: isActive ? '#22c55e' : '#ef4444',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            {isActive ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Mode dropdown */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Mode</label>
          <select
            value={mode}
            onChange={(e) => updateDND({ mode: e.target.value as ExtendedDNDConfig['mode'] })}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
          >
            {DND_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        {/* Schedule inputs (shown when mode is Schedule / FOCUS_HOURS) */}
        {mode === 'FOCUS_HOURS' && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Start</label>
                <input
                  type="time"
                  value={dndConfig?.startTime ?? ''}
                  onChange={(e) => updateDND({ startTime: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>End</label>
                <input
                  type="time"
                  value={dndConfig?.endTime ?? ''}
                  onChange={(e) => updateDND({ endTime: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>
            </div>

            {/* Day checkboxes */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {DAYS_OF_WEEK.map((day) => {
                const selected = dndConfig?.scheduleDays?.includes(day) ?? false;
                return (
                  <button
                    key={day}
                    onClick={() => {
                      const current = dndConfig?.scheduleDays ?? [];
                      const next = selected
                        ? current.filter((d) => d !== day)
                        : [...current, day];
                      updateDND({ scheduleDays: next });
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      backgroundColor: selected ? '#3b82f6' : 'white',
                      color: selected ? 'white' : '#374151',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Checkboxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={dndConfig?.vipBreakthroughEnabled ?? false}
              onChange={(e) => updateDND({ vipBreakthroughEnabled: e.target.checked })}
            />
            Allow VIP breakthrough
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={dndConfig?.allowCrisisAlerts ?? false}
              onChange={(e) => updateDND({ allowCrisisAlerts: e.target.checked })}
            />
            Allow crisis-level alerts
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={dndConfig?.allowStarredCalls ?? false}
              onChange={(e) => updateDND({ allowStarredCalls: e.target.checked })}
            />
            Allow calls from starred contacts
          </label>
        </div>

        {/* When DND active behavior */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
            When DND active
          </label>
          <select
            value={dndConfig?.whenActiveBehavior ?? 'QUEUE'}
            onChange={(e) => updateDND({ whenActiveBehavior: e.target.value as ExtendedDNDConfig['whenActiveBehavior'] })}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
          >
            {WHEN_ACTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {dndError && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#ef4444' }}>
            {dndError}
          </div>
        )}
      </div>
    );
  };
  // ---------------------------------------------------------------------------
  // Render: Today's Interruption Log
  // ---------------------------------------------------------------------------
  const renderInterruptionLog = () => {
    if (budgetLoading) return <SectionSkeleton height={160} />;

    return (
      <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '16px' }}>
          Today&apos;s Interruption Log
        </h3>

        {interruptions.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
            No interruptions today. Your attention is fully protected.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Time</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Source</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Priority</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Action Taken</th>
                </tr>
              </thead>
              <tbody>
                {interruptions.map((entry) => (
                  <tr key={entry?.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                      {entry?.time ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ marginRight: '6px' }}>
                        {TYPE_EMOJI[entry?.type?.toLowerCase?.()] ?? '📨'}
                      </span>
                      {entry?.type ?? 'Unknown'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {entry?.source ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={PRIORITY_BADGE_STYLES[entry?.priority] ?? PRIORITY_BADGE_STYLES.P2}>
                        {entry?.priority ?? 'P2'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>
                      {entry?.actionTaken ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {renderBudgetSection()}
      {renderDNDSection()}
      {renderInterruptionLog()}

      {/* Pulse animation for skeleton */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
