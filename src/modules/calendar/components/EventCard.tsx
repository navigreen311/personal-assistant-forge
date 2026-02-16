'use client';

import { format } from 'date-fns';
import type { CalendarEventDisplay } from '../calendar.types';

interface EventCardProps {
  event: CalendarEventDisplay;
  compact?: boolean;
  onClick?: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  MEETING: '\u{1F4CB}',
  CALL: '\u{1F4DE}',
  FOCUS_BLOCK: '\u{1F3AF}',
  TRAVEL: '\u{1F697}',
  BREAK: '\u{2615}',
  PREP: '\u{1F4DD}',
  DEBRIEF: '\u{1F4AC}',
  PERSONAL: '\u{1F464}',
  DEADLINE: '\u{23F0}',
  REMINDER: '\u{1F514}',
};

export function EventCard({ event, compact = false, onClick }: EventCardProps) {
  const startTime = new Date(event.startTime);
  const endTime = new Date(event.endTime);
  const icon = TYPE_ICONS[event.type] ?? '';

  if (compact) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        style={{
          fontSize: '10px',
          padding: '2px 4px',
          borderRadius: '3px',
          background: event.entityColor + '20',
          borderLeft: `3px solid ${event.entityColor}`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          position: 'relative',
        }}
      >
        {event.hasConflict && (
          <span style={{ color: '#ef4444', marginRight: '2px' }} title="Conflict">!</span>
        )}
        {event.title}
      </div>
    );
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        padding: '6px 8px',
        borderRadius: '6px',
        background: event.entityColor + '15',
        borderLeft: `4px solid ${event.entityColor}`,
        cursor: 'pointer',
        marginBottom: '2px',
        border: event.hasConflict ? '1px solid #ef4444' : '1px solid transparent',
        ...(event.isInFocusBlock ? {
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.03) 5px, rgba(0,0,0,0.03) 10px)',
        } : {}),
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px' }}>{icon}</span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>{event.title}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {event.hasPrepPacket && (
            <span title="Prep packet available" style={{ fontSize: '12px' }}>&#x1F4C4;</span>
          )}
          {event.hasConflict && (
            <span title="Has conflict" style={{ fontSize: '12px', color: '#ef4444' }}>&#x26A0;</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
        {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
      </div>
      {event.participantNames.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          {event.participantNames.slice(0, 3).map((name, i) => (
            <div
              key={i}
              title={name}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              {name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
            </div>
          ))}
          {event.participantNames.length > 3 && (
            <div style={{ fontSize: '10px', color: '#6b7280', alignSelf: 'center' }}>
              +{event.participantNames.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
