'use client';

import React, { useCallback, useEffect, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EnhancedDelegationInboxProps {
  entityId?: string;
  onDelegated?: () => void;
}

interface Assignee {
  id: string;
  name: string;
  role: string;
  score: number;
}

interface DelegationSuggestion {
  taskId: string;
  taskTitle: string;
  entityId: string;
  entityName: string;
  priority: 'P0' | 'P1' | 'P2';
  estimatedEffort: string;
  reason: string;
  suggestedAssignee: Assignee;
  alternativeAssignee?: Assignee;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const priorityStyles: Record<string, { bg: string; text: string; label: string }> = {
  P0: { bg: '#fee2e2', text: '#991b1b', label: 'P0 \u2014 Critical' },
  P1: { bg: '#fef3c7', text: '#92400e', label: 'P1 \u2014 High' },
  P2: { bg: '#dbeafe', text: '#1e40af', label: 'P2 \u2014 Normal' },
};

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG to avoid external deps)                          */
/* ------------------------------------------------------------------ */

function RobotIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton card                                                      */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        backgroundColor: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ width: '55%', height: '18px', borderRadius: '4px', backgroundColor: '#f3f4f6' }} />
        <div style={{ width: '60px', height: '22px', borderRadius: '12px', backgroundColor: '#f3f4f6' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ width: '90px', height: '22px', borderRadius: '12px', backgroundColor: '#f3f4f6' }} />
        <div style={{ width: '70px', height: '22px', borderRadius: '12px', backgroundColor: '#f3f4f6' }} />
      </div>
      <div style={{ width: '100%', height: '40px', borderRadius: '6px', backgroundColor: '#f3f4f6', marginBottom: '12px' }} />
      <div style={{ width: '45%', height: '14px', borderRadius: '4px', backgroundColor: '#f3f4f6', marginBottom: '16px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ width: '120px', height: '34px', borderRadius: '6px', backgroundColor: '#f3f4f6' }} />
        <div style={{ width: '100px', height: '34px', borderRadius: '6px', backgroundColor: '#f3f4f6' }} />
        <div style={{ width: '90px', height: '34px', borderRadius: '6px', backgroundColor: '#f3f4f6' }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function EnhancedDelegationInbox({ entityId, onDelegated }: EnhancedDelegationInboxProps) {
  const [suggestions, setSuggestions] = useState<DelegationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = entityId
        ? `/api/delegation/inbox?entityId=${encodeURIComponent(entityId)}`
        : '/api/delegation/inbox';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load suggestions (${res.status})`);
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.data ?? []);
      const data: DelegationSuggestion[] = items.map((item: any) => ({
        taskId: item.taskId,
        taskTitle: item.taskTitle,
        entityId: entityId ?? '',
        entityName: '',
        priority: item.priority === 'HIGH' ? 'P0' : item.priority === 'MEDIUM' ? 'P1' : 'P2',
        estimatedEffort: item.estimatedTimeSavedMinutes ? `${item.estimatedTimeSavedMinutes}m` : 'N/A',
        reason: item.reason,
        suggestedAssignee: {
          id: item.suggestedDelegatee ?? 'unknown',
          name: item.suggestedDelegatee ?? 'Unknown',
          role: 'Delegatee',
          score: item.confidence ?? 0,
        },
      }));
      setSuggestions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleDelegate = async (suggestion: DelegationSuggestion, assigneeId: string) => {
    setActionInFlight(suggestion.taskId);
    try {
      const res = await fetch('/api/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: suggestion.taskId,
          delegatedTo: assigneeId,
          entityId: suggestion.entityId,
        }),
      });
      if (!res.ok) throw new Error('Delegation failed');
      setSuggestions((prev) => prev.filter((s) => s.taskId !== suggestion.taskId));
      onDelegated?.();
    } catch {
      // keep card visible so user can retry
    } finally {
      setActionInFlight(null);
    }
  };

  const handleAutoAssign = async (suggestion: DelegationSuggestion) => {
    setActionInFlight(suggestion.taskId);
    try {
      const res = await fetch('/api/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: suggestion.taskId,
          delegatedTo: suggestion.suggestedAssignee?.id ?? 'auto',
        }),
      });
      if (!res.ok) throw new Error('Auto-assign failed');
      setSuggestions((prev) => prev.filter((s) => s.taskId !== suggestion.taskId));
      onDelegated?.();
    } catch {
      // keep card visible
    } finally {
      setActionInFlight(null);
    }
  };

  const handleKeepMine = (taskId: string) => {
    setSuggestions((prev) => prev.filter((s) => s.taskId !== taskId));
  };

  if (loading) {
    return (
      <div>
        <Header onRefresh={fetchSuggestions} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header onRefresh={fetchSuggestions} />
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            backgroundColor: '#fef2f2',
          }}
        >
          <p style={{ color: '#991b1b', fontWeight: 500, marginBottom: '12px' }}>{error}</p>
          <button
            onClick={fetchSuggestions}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div>
        <Header onRefresh={fetchSuggestions} />
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
          <p>
            No delegation suggestions right now. As you add more tasks, AI will identify ones that
            can be handed off.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header onRefresh={fetchSuggestions} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {suggestions.map((suggestion) => {
          const pStyle = priorityStyles[suggestion.priority] || priorityStyles.P2;
          const busy = actionInFlight === suggestion.taskId;

          return (
            <div
              key={suggestion.taskId}
              style={{
                padding: '20px',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                opacity: busy ? 0.6 : 1,
                pointerEvents: busy ? 'none' : 'auto',
                transition: 'opacity 0.15s ease',
              }}
            >
              {/* Row 1: title + priority badge */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '10px',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>
                  {suggestion.taskTitle}
                </span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: pStyle.bg,
                    color: pStyle.text,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pStyle.label}
                </span>
              </div>

              {/* Row 2: entity pill + estimated effort */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: '#eef2ff',
                    color: '#4338ca',
                  }}
                >
                  {suggestion.entityName}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  Est. {suggestion.estimatedEffort}
                </span>
              </div>

              {/* Why delegate section */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '10px 12px',
                  backgroundColor: '#fffbeb',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ flexShrink: 0, marginTop: '1px' }}>
                  <LightbulbIcon />
                </span>
                <span style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.45' }}>
                  {suggestion.reason}
                </span>
              </div>

              {/* Suggested assignee */}
              <div style={{ marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#374151' }}>
                  <strong>Suggested:</strong>{' '}
                  {suggestion.suggestedAssignee.name} ({suggestion.suggestedAssignee.role}) &mdash;{' '}
                  Score: {suggestion.suggestedAssignee.score}
                </span>
              </div>

              {/* Alternative assignee */}
              {suggestion.alternativeAssignee && (
                <div style={{ marginBottom: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    Alternative:{' '}
                    {suggestion.alternativeAssignee.name} ({suggestion.alternativeAssignee.role}) &mdash;{' '}
                    Score: {suggestion.alternativeAssignee.score}
                  </span>
                </div>
              )}

              {!suggestion.alternativeAssignee && <div style={{ marginBottom: '14px' }} />}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() =>
                    handleDelegate(suggestion, suggestion.suggestedAssignee.id)
                  }
                  disabled={busy}
                  style={{
                    padding: '7px 14px',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Delegate to {suggestion.suggestedAssignee.name}
                </button>
                <button
                  onClick={() => handleAutoAssign(suggestion)}
                  disabled={busy}
                  style={{
                    padding: '7px 14px',
                    backgroundColor: '#22c55e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Auto-assign
                </button>
                <button
                  onClick={() => handleKeepMine(suggestion.taskId)}
                  disabled={busy}
                  style={{
                    padding: '7px 14px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Keep mine
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header sub-component                                               */
/* ------------------------------------------------------------------ */

export default EnhancedDelegationInbox;

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <RobotIcon />
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
          AI Delegation Suggestions
        </h2>
      </div>
      <button
        onClick={onRefresh}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: '#f3f4f6',
          color: '#374151',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        <RefreshIcon />
        Refresh
      </button>
    </div>
  );
}
