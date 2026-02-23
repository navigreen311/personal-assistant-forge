'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ScoreboardDelegate {
  id: string;
  name: string;
  role: string;
  isAI: boolean;
  tasksDone: number;
  avgSpeedMinutes: number;
  quality: number;
  onTimePercent: number;
}

interface ScoreboardData {
  delegates: ScoreboardDelegate[];
  insight: string;
}

interface EnhancedScoreboardProps {
  entityId?: string;
}

type SortKey = 'name' | 'tasksDone' | 'avgSpeedMinutes' | 'quality' | 'onTimePercent';
type SortDir = 'asc' | 'desc';

function formatSpeed(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hrs`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

function onTimeColor(percent: number): string {
  if (percent >= 90) return '#16a34a';
  if (percent >= 75) return '#d97706';
  return '#dc2626';
}

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5].map((col) => (
        <td key={col} style={{ padding: '12px' }}>
          <div
            style={{
              height: '16px',
              backgroundColor: '#e5e7eb',
              borderRadius: '4px',
              animation: 'pulse 1.5s ease-in-out infinite',
              width: col === 1 ? '140px' : '80px',
            }}
          />
        </td>
      ))}
    </tr>
  );
}
function renderStars(quality: number): React.ReactNode {
  const fullStars = Math.floor(quality);
  const stars: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    stars.push(
      <span
        key={i}
        style={{ color: i < fullStars ? '#facc15' : '#d1d5db', fontSize: '14px' }}
      >
        ★
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {stars}
      <span style={{ marginLeft: '4px', fontSize: '13px', color: '#374151' }}>
        {quality.toFixed(1)}/5
      </span>
    </span>
  );
}

export default function EnhancedScoreboard({ entityId }: EnhancedScoreboardProps) {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('tasksDone');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = entityId
      ? `/api/delegation/scores?entityId=${encodeURIComponent(entityId)}`
      : '/api/delegation/scores';

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch scores (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          const payload: ScoreboardData = json.data ?? json;
          setData(payload);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entityId]);
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'name' ? 'asc' : 'desc');
      }
    },
    [sortKey]
  );

  const sortedDelegates = data
    ? [...data.delegates].sort((a, b) => {
        const mul = sortDir === 'asc' ? 1 : -1;
        if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
        return mul * ((a[sortKey] as number) - (b[sortKey] as number));
      })
    : [];

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const headerStyle = (key: SortKey, align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    textAlign: align,
    padding: '12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    backgroundColor: sortKey === key ? '#e5e7eb' : undefined,
    borderRadius: '4px',
  });
  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Pulse animation for skeleton */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* Header */}
      <div style={{ padding: '20px 24px 0 24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>
          Delegation Scoreboard
        </h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
          Track delegate reliability and quality.
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 24px 24px 24px' }}>
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              borderRadius: '8px',
              fontSize: '14px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                <th onClick={() => handleSort('name')} style={headerStyle('name')}>
                  Delegate{sortIndicator('name')}
                </th>
                <th onClick={() => handleSort('tasksDone')} style={headerStyle('tasksDone', 'right')}>
                  Tasks Done{sortIndicator('tasksDone')}
                </th>
                <th onClick={() => handleSort('avgSpeedMinutes')} style={headerStyle('avgSpeedMinutes', 'right')}>
                  Avg Speed{sortIndicator('avgSpeedMinutes')}
                </th>
                <th onClick={() => handleSort('quality')} style={headerStyle('quality', 'right')}>
                  Quality{sortIndicator('quality')}
                </th>
                <th onClick={() => handleSort('onTimePercent')} style={headerStyle('onTimePercent', 'right')}>
                  On-Time %{sortIndicator('onTimePercent')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              )}
              {!loading && sortedDelegates.length === 0 && !error && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    No delegation history yet. Start delegating tasks to see performance data here.
                  </td>
                </tr>
              )}

              {!loading &&
                sortedDelegates.map((delegate) => (
                  <tr
                    key={delegate.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: delegate.isAI ? 'rgba(239, 246, 255, 0.5)' : undefined,
                    }}
                  >
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {delegate.isAI && <span style={{ fontSize: '16px' }}>🤖</span>}
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: '14px' }}>
                            {delegate.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>{delegate.role}</div>
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: '#374151',
                        fontSize: '14px',
                      }}
                    >
                      {delegate.tasksDone}
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        color: '#374151',
                        fontSize: '14px',
                      }}
                    >
                      {formatSpeed(delegate.avgSpeedMinutes)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {renderStars(delegate.quality)}
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: onTimeColor(delegate.onTimePercent),
                      }}
                    >
                      {delegate.onTimePercent}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {/* Quality explanation footer */}
        {!loading && sortedDelegates.length > 0 && (
          <p
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '12px',
              fontStyle: 'italic',
            }}
          >
            Quality = user rating after reviewing completed work. AI agents have quality based on
            approval-without-edit rate.
          </p>
        )}

        {/* AI Insight */}
        {!loading && data?.insight && (
          <div
            style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ fontSize: '20px', flexShrink: 0 }}>💡</span>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#1e40af',
                  marginBottom: '4px',
                }}
              >
                AI Insight
              </div>
              <p style={{ fontSize: '14px', color: '#1e3a5f', margin: 0, lineHeight: '1.5' }}>
                {data.insight}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
