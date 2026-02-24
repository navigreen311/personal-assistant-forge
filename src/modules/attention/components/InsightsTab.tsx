'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  entityId?: string;
  period?: string;
}

interface InterruptionStats {
  totalInterrupts: number;
  blockedDND: number;
  avgFocusSessionMinutes: number;
  attentionScore: number;
}

interface HeatmapCell {
  day: string;
  hour: number;
  count: number;
}

interface Interrupter {
  source: string;
  count: number;
  percentOfTotal: number;
  avgPriority: number;
}

interface Recommendation {
  id: string;
  text: string;
}

interface InsightsData {
  stats: InterruptionStats;
  heatmap: HeatmapCell[];
  interrupters: Interrupter[];
  recommendations: Recommendation[];
}

// ---------------------------------------------------------------------------
// Demo data fallback
// ---------------------------------------------------------------------------

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const HOURS = Array.from({ length: 12 }, (_, i) => 7 + i); // 7am - 6pm

const DAY_FULL_NAMES: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
};

function buildDemoHeatmap(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (const day of DAYS) {
    for (const hour of HOURS) {
      let base = Math.floor(Math.random() * 3);
      if (hour === 9) base += 4 + Math.floor(Math.random() * 3);
      if (hour === 10) base += 2 + Math.floor(Math.random() * 2);
      if (day === 'Tue' && hour === 9) base += 2;
      cells.push({ day, hour, count: base });
    }
  }
  return cells;
}

const DEMO_DATA: InsightsData = {
  stats: {
    totalInterrupts: 47,
    blockedDND: 18,
    avgFocusSessionMinutes: 34,
    attentionScore: 72,
  },
  heatmap: buildDemoHeatmap(),
  interrupters: [
    { source: 'Inbox emails', count: 19, percentOfTotal: 40.4, avgPriority: 1.2 },
    { source: 'Task alerts', count: 13, percentOfTotal: 27.7, avgPriority: 0.8 },
    { source: 'VoiceForge calls', count: 9, percentOfTotal: 19.1, avgPriority: 1.5 },
    { source: 'Calendar reminders', count: 6, percentOfTotal: 12.8, avgPriority: 0.5 },
  ],
  recommendations: [
    {
      id: 'rec-1',
      text: 'Your peak interruption window is 9\u201310 am. Consider enabling DND during that hour to protect deep work.',
    },
    {
      id: 'rec-2',
      text: 'Inbox emails account for 40% of interruptions. Batch-checking email twice a day could recover ~25 min of focus.',
    },
    {
      id: 'rec-3',
      text: 'Your attention score improved 8 points this week. Keep leveraging Focus Mode sessions to maintain momentum.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHour(h: number): string {
  if (h === 0 || h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function heatColor(count: number, max: number): string {
  if (max === 0 || count === 0) return '#ffffff';
  const ratio = count / max;
  if (ratio < 0.25) return '#dbeafe';
  if (ratio < 0.5) return '#93c5fd';
  if (ratio < 0.75) return '#3b82f6';
  return '#1e3a8a';
}

function peakHourLabel(heatmap: HeatmapCell[]): string {
  let maxCount = 0;
  let peakHour = 9;
  const hourTotals: Record<number, number> = {};
  for (const cell of heatmap) {
    hourTotals[cell.hour] = (hourTotals[cell.hour] ?? 0) + cell.count;
  }
  for (const [h, total] of Object.entries(hourTotals)) {
    if (total > maxCount) {
      maxCount = total;
      peakHour = Number(h);
    }
  }
  return `Most interruptions ${formatHour(peakHour)}\u2013${formatHour(peakHour + 1)}`;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonBlock({ height = 20, width = '100%' }: { height?: number; width?: string | number }) {
  return (
    <div
      style={{
        height,
        width,
        backgroundColor: '#e5e7eb',
        borderRadius: '4px',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
      <SkeletonBlock height={16} width="40%" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} height={14} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PERIODS = ['This Week', 'This Month', 'This Quarter'] as const;

export function InsightsTab({ entityId, period: initialPeriod }: Props) {
  const [period, setPeriod] = useState<string>(initialPeriod ?? 'This Week');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const periodMap: Record<string, string> = { 'This Week': 'thisWeek', 'This Month': 'thisMonth', 'This Quarter': 'thisQuarter' };
      const query = new URLSearchParams({
        period: periodMap[period] ?? period,
        ...(entityId ? { entityId } : {}),
      });

      const res = await fetch(`/api/attention/insights?${query.toString()}`);
      if (!res.ok) throw new Error('API error');
      const raw = await res.json();
      const apiData = raw.data ?? raw;
      // Transform API shape to component shape
      const DAYS_MAP = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const heatmapCells: HeatmapCell[] = [];
      if (Array.isArray(apiData.heatmap)) {
        apiData.heatmap.forEach((row: number[], hour: number) => {
          if (Array.isArray(row)) {
            row.forEach((count: number, dayIdx: number) => {
              heatmapCells.push({ day: DAYS_MAP[dayIdx] ?? `Day${dayIdx}`, hour, count });
            });
          }
        });
      }
      const json: InsightsData = {
        stats: {
          totalInterrupts: apiData.totalInterrupts ?? apiData.stats?.totalInterrupts ?? 0,
          blockedDND: apiData.blockedDND ?? apiData.stats?.blockedDND ?? 0,
          avgFocusSessionMinutes: apiData.avgFocusSession ?? apiData.avgFocusSessionMinutes ?? apiData.stats?.avgFocusSessionMinutes ?? 0,
          attentionScore: apiData.attentionScore ?? apiData.stats?.attentionScore ?? 0,
        },
        heatmap: heatmapCells.length > 0 ? heatmapCells : (apiData.heatmap && !Array.isArray(apiData.heatmap?.[0]) ? apiData.heatmap : []),
        interrupters: apiData.topInterrupters ?? apiData.interrupters ?? [],
        recommendations: (apiData.recommendations ?? []).map((r: any, i: number) => ({
          id: r.id ?? `rec-${i}`,
          text: r.text ?? r,
        })),
      };
      setData(json);
    } catch {
      // Fallback to demo data on any error
      setData(DEMO_DATA);
    } finally {
      setLoading(false);
    }
  }, [period, entityId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Derived values with optional chaining
  const stats = data?.stats;
  const heatmap = data?.heatmap ?? [];
  const interrupters = data?.interrupters ?? [];
  const recommendations = data?.recommendations ?? [];

  const heatmapMax = heatmap.length > 0
    ? Math.max(...heatmap.map((c) => c?.count ?? 0))
    : 0;

  const sortedInterrupters = [...interrupters].sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* Period Selector */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: period === p ? '2px solid #3b82f6' : '1px solid #d1d5db',
              backgroundColor: period === p ? '#eff6ff' : '#ffffff',
              color: period === p ? '#1d4ed8' : '#374151',
              fontWeight: period === p ? 600 : 400,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Interruption Analytics Stats Bar */}
      <div>
        <h3 style={{ fontWeight: 600, marginBottom: '12px', fontSize: '16px' }}>Interruption Analytics</h3>
        {loading ? (
          <SectionSkeleton rows={2} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {/* Total Interrupts - blue */}
            <div style={{
              padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe',
              backgroundColor: '#eff6ff', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb' }}>
                {stats?.totalInterrupts ?? 0}
              </div>
              <div style={{ fontSize: '13px', color: '#3b82f6', marginTop: '4px' }}>Total Interrupts</div>
            </div>

            {/* Blocked DND - green */}
            <div style={{
              padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0',
              backgroundColor: '#f0fdf4', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>
                {stats?.blockedDND ?? 0}
              </div>
              <div style={{ fontSize: '13px', color: '#22c55e', marginTop: '4px' }}>Blocked DND</div>
            </div>

            {/* Avg Focus Session - purple */}
            <div style={{
              padding: '16px', borderRadius: '8px', border: '1px solid #e9d5ff',
              backgroundColor: '#faf5ff', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#7c3aed' }}>
                {stats?.avgFocusSessionMinutes ?? 0}<span style={{ fontSize: '14px', fontWeight: 400 }}> min</span>
              </div>
              <div style={{ fontSize: '13px', color: '#8b5cf6', marginTop: '4px' }}>Avg Focus Session</div>
            </div>

            {/* Attention Score - amber */}
            <div style={{
              padding: '16px', borderRadius: '8px', border: '1px solid #fde68a',
              backgroundColor: '#fffbeb', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#d97706' }}>
                {stats?.attentionScore ?? 0}<span style={{ fontSize: '14px', fontWeight: 400 }}>/100</span>
              </div>
              <div style={{ fontSize: '13px', color: '#f59e0b', marginTop: '4px' }}>Attention Score</div>
            </div>
          </div>
        )}
      </div>

      {/* Interruption Heatmap */}
      <div>
        <h3 style={{ fontWeight: 600, marginBottom: '12px', fontSize: '16px' }}>Interruption Heatmap</h3>
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : (
          <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 8px', fontSize: '12px', color: '#6b7280' }} />
                    {DAYS.map((d) => (
                      <th key={d} style={{ padding: '4px 8px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hour) => (
                    <tr key={hour}>
                      <td style={{ padding: '2px 8px', fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {formatHour(hour)}
                      </td>
                      {DAYS.map((day) => {
                        const cell = heatmap.find((c) => c?.day === day && c?.hour === hour);
                        const count = cell?.count ?? 0;
                        const isHovered = hoveredCell?.day === day && hoveredCell?.hour === hour;
                        return (
                          <td
                            key={day}
                            onMouseEnter={() => setHoveredCell(cell ?? { day, hour, count: 0 })}
                            onMouseLeave={() => setHoveredCell(null)}
                            style={{ padding: '2px', textAlign: 'center', position: 'relative' }}
                          >
                            <div
                              style={{
                                width: '100%',
                                minWidth: '36px',
                                height: '28px',
                                borderRadius: '4px',
                                backgroundColor: heatColor(count, heatmapMax),
                                border: isHovered ? '2px solid #1e40af' : '1px solid #e5e7eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                color: count / (heatmapMax || 1) >= 0.5 ? '#ffffff' : '#6b7280',
                                cursor: 'default',
                              }}
                            >
                              {count > 0 ? count : ''}
                            </div>
                            {isHovered && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: '110%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  backgroundColor: '#1f2937',
                                  color: '#ffffff',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  whiteSpace: 'nowrap',
                                  zIndex: 10,
                                  pointerEvents: 'none',
                                }}
                              >
                                {DAY_FULL_NAMES[day] ?? day} {formatHour(hour)}: {count} interruption{count !== 1 ? 's' : ''}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Peak annotation */}
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
              {peakHourLabel(heatmap)}
            </div>

            {/* Legend */}
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9ca3af' }}>
              <span>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                <div
                  key={r}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: r === 0 ? '#ffffff' : heatColor(r * 10, 10),
                    border: '1px solid #e5e7eb',
                  }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        )}
      </div>

      {/* Top Interrupters Table */}
      <div>
        <h3 style={{ fontWeight: 600, marginBottom: '12px', fontSize: '16px' }}>Top Interrupters</h3>
        {loading ? (
          <SectionSkeleton rows={5} />
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '13px', color: '#374151' }}>Source</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '13px', color: '#374151' }}>Count</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '13px', color: '#374151' }}>% of Total</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '13px', color: '#374151' }}>Avg Priority</th>
                </tr>
              </thead>
              <tbody>
                {sortedInterrupters.map((row) => (
                  <tr key={row?.source} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px', fontSize: '14px' }}>{row?.source ?? 'Unknown'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>
                      {row?.count ?? 0}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>
                      {(row?.percentOfTotal ?? 0).toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>
                      {(row?.avgPriority ?? 0).toFixed(1)}
                    </td>
                  </tr>
                ))}
                {sortedInterrupters.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                      No interruption data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Recommendations */}
      <div>
        <h3 style={{ fontWeight: 600, marginBottom: '12px', fontSize: '16px' }}>AI Recommendations</h3>
        {loading ? (
          <SectionSkeleton rows={3} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recommendations.map((rec) => (
              <div
                key={rec?.id}
                style={{
                  padding: '14px 16px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  border: '1px solid #bfdbfe',
                }}
              >
                {/* Lightbulb icon (SVG) */}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0, marginTop: '2px' }}
                >
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5C8.35 12.26 8.82 13.02 9 14" />
                </svg>
                <span style={{ fontSize: '14px', color: '#1e3a8a', lineHeight: '1.5' }}>
                  {rec?.text ?? ''}
                </span>
              </div>
            ))}

            {recommendations.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                No recommendations available yet
              </div>
            )}

            <button
              onClick={() => {
                // Placeholder: apply recommended settings
              }}
              style={{
                marginTop: '4px',
                padding: '10px 24px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              Apply recommended settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default InsightsTab;
