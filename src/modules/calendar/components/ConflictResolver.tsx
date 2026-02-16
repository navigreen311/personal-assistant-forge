'use client';

import type { ConflictInfo } from '../calendar.types';

interface ConflictResolverProps {
  conflicts: ConflictInfo[];
  onResolve?: (conflict: ConflictInfo, action: string) => void;
  onForceSchedule?: () => void;
  onClose: () => void;
}

const CONFLICT_ICONS: Record<string, string> = {
  TIME_OVERLAP: '\u{1F534}',
  BUFFER_VIOLATION: '\u{1F7E1}',
  FOCUS_BLOCK: '\u{1F3AF}',
  MEETING_FREE_DAY: '\u{1F4C5}',
  TRAVEL_TIME: '\u{1F697}',
  BACK_TO_BACK: '\u{26A1}',
  ENERGY_LOW: '\u{1F50B}',
  ATTENTION_BUDGET: '\u{1F9E0}',
  CROSS_ENTITY: '\u{1F310}',
  PARTICIPANT_UNAVAILABLE: '\u{1F464}',
};

export function ConflictResolver({ conflicts, onResolve, onForceSchedule, onClose }: ConflictResolverProps) {
  const hardConflicts = conflicts.filter((c) => c.severity === 'HARD');
  const softConflicts = conflicts.filter((c) => c.severity === 'SOFT');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '500px',
        width: '100%', maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Scheduling Conflicts</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
        </div>

        {hardConflicts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', color: '#dc2626', margin: '0 0 8px' }}>Hard Conflicts (Cannot Override)</h3>
            {hardConflicts.map((c, i) => (
              <ConflictItem key={i} conflict={c} onResolve={onResolve} />
            ))}
          </div>
        )}

        {softConflicts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', color: '#ca8a04', margin: '0 0 8px' }}>Soft Conflicts (Can Override)</h3>
            {softConflicts.map((c, i) => (
              <ConflictItem key={i} conflict={c} onResolve={onResolve} />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
            Cancel
          </button>
          {hardConflicts.length === 0 && softConflicts.length > 0 && (
            <button
              onClick={onForceSchedule}
              style={{
                flex: 1, padding: '10px', background: '#f59e0b', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
              }}
            >
              Force Schedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConflictItem({ conflict, onResolve }: { conflict: ConflictInfo; onResolve?: (c: ConflictInfo, a: string) => void }) {
  const icon = CONFLICT_ICONS[conflict.type] ?? '\u{26A0}';

  return (
    <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{icon}</span>
        <span style={{
          fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
          background: conflict.severity === 'HARD' ? '#fef2f2' : '#fffbeb',
          color: conflict.severity === 'HARD' ? '#dc2626' : '#ca8a04',
          fontWeight: 600,
        }}>
          {conflict.severity}
        </span>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>{conflict.type.replace(/_/g, ' ')}</span>
      </div>
      <div style={{ fontSize: '13px', marginTop: '6px' }}>{conflict.description}</div>
      {conflict.existingEvent && (
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          Existing: &quot;{conflict.existingEvent.title}&quot;
        </div>
      )}
      {conflict.resolution && (
        <button
          onClick={() => onResolve?.(conflict, conflict.resolution!)}
          style={{
            marginTop: '6px', padding: '4px 10px', fontSize: '12px',
            border: '1px solid #3b82f6', borderRadius: '4px', color: '#3b82f6',
            background: '#fff', cursor: 'pointer',
          }}
        >
          {conflict.resolution}
        </button>
      )}
    </div>
  );
}
