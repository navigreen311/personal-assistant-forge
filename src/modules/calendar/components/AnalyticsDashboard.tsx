'use client';

import { useState, useEffect } from 'react';
import type { ScheduleAnalytics, ScheduleOptimization } from '../calendar.types';

interface AnalyticsDashboardProps {
  startDate: string;
  endDate: string;
  entityId?: string;
}

const ALLOCATION_COLORS: Record<string, string> = {
  meetings: '#3b82f6',
  focusBlocks: '#22c55e',
  travel: '#f97316',
  breaks: '#a855f7',
  prep: '#eab308',
  unscheduled: '#e5e7eb',
};

const IMPACT_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: '#fee2e2', text: '#dc2626' },
  MEDIUM: { bg: '#fef9c3', text: '#ca8a04' },
  LOW: { bg: '#f0fdf4', text: '#16a34a' },
};

export function AnalyticsDashboard({ startDate, endDate, entityId }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<ScheduleAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ startDate, endDate });
        if (entityId) params.set('entityId', entityId);
        const res = await fetch(`/api/calendar/analytics?${params}`);
        const json = await res.json();
        if (json.success) setAnalytics(json.data);
      } catch {
        // Handle error
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [startDate, endDate, entityId]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading analytics...</div>;
  if (!analytics) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No analytics data available.</div>;

  const { timeAllocation, meetingMetrics, energyMetrics, suggestions } = analytics;
  const totalHours = Object.values(timeAllocation).reduce((s, v) => s + v, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Time Allocation */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Time Allocation</h3>
        <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden' }}>
          {Object.entries(timeAllocation).map(([key, value]) => {
            const pct = totalHours > 0 ? (value / totalHours) * 100 : 0;
            if (pct < 1) return null;
            return (
              <div
                key={key}
                title={`${key}: ${value}h (${Math.round(pct)}%)`}
                style={{
                  width: `${pct}%`,
                  background: ALLOCATION_COLORS[key] ?? '#e5e7eb',
                  minWidth: pct > 0 ? '4px' : 0,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
          {Object.entries(timeAllocation).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: ALLOCATION_COLORS[key] ?? '#e5e7eb' }} />
              <span style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}: {value}h</span>
            </div>
          ))}
        </div>
      </div>

      {/* Meeting Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <MetricCard label="Total Meetings" value={String(meetingMetrics.totalMeetings)} />
        <MetricCard label="Avg Duration" value={`${meetingMetrics.avgDuration} min`} />
        <MetricCard label="Back-to-Back" value={String(meetingMetrics.backToBackCount)} warn={meetingMetrics.backToBackCount > 3} />
        <MetricCard label="Meeting-Free Days" value={String(meetingMetrics.meetingFreedays)} />
        <MetricCard label="Busiest Day" value={meetingMetrics.busiestDay} />
        <MetricCard label="Avg/Day" value={String(meetingMetrics.avgMeetingsPerDay)} />
      </div>

      {/* Energy Metrics */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Energy Utilization</h3>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
            <span>Peak Hours Utilized</span>
            <span style={{ fontWeight: 600 }}>{energyMetrics.peakHoursUtilized}%</span>
          </div>
          <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${energyMetrics.peakHoursUtilized}%`,
              height: '100%',
              background: energyMetrics.peakHoursUtilized >= 60 ? '#22c55e' : '#f59e0b',
              borderRadius: '4px',
            }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '13px' }}>
          <div>
            <div style={{ color: '#6b7280' }}>Low Energy Meetings</div>
            <div style={{ fontWeight: 700, fontSize: '20px' }}>{energyMetrics.lowEnergyMeetings}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280' }}>Context Switches</div>
            <div style={{ fontWeight: 700, fontSize: '20px' }}>{energyMetrics.contextSwitches}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280' }}>Avg Switch Cost</div>
            <div style={{ fontWeight: 700, fontSize: '20px' }}>{energyMetrics.avgContextSwitchCost}/10</div>
          </div>
        </div>
      </div>

      {/* Optimization Suggestions */}
      {suggestions.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Optimization Suggestions</h3>
          {suggestions.map((s, i) => (
            <SuggestionItem key={i} suggestion={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${warn ? '#fca5a5' : '#e5e7eb'}`,
      borderRadius: '8px', padding: '16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: warn ? '#dc2626' : '#111827' }}>{value}</div>
    </div>
  );
}

function SuggestionItem({ suggestion }: { suggestion: ScheduleOptimization }) {
  const impact = IMPACT_COLORS[suggestion.impact] ?? IMPACT_COLORS.LOW;
  return (
    <div style={{ padding: '10px', border: '1px solid #f3f4f6', borderRadius: '8px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{suggestion.description}</span>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
          background: impact.bg, color: impact.text, fontWeight: 600,
        }}>
          {suggestion.impact}
        </span>
      </div>
    </div>
  );
}
