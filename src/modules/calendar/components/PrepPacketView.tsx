'use client';

import { useState } from 'react';
import type { GeneratedPrepPacket } from '../calendar.types';

interface PrepPacketViewProps {
  packet: GeneratedPrepPacket;
  eventId: string;
  entityId: string;
}

interface CollapsibleSectionProps {
  title: string;
  items: string[];
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, items, defaultOpen = true }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
          border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
          color: '#374151', padding: 0,
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>
          &#x25B6;
        </span>
        {title} ({items.length})
      </button>
      {open && (
        <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '12px', lineHeight: 1.6 }}>
          {items.map((item, i) => (
            <li key={i} style={{ color: '#4b5563' }}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrepPacketView({ packet, eventId, entityId }: PrepPacketViewProps) {
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await fetch(`/api/calendar/${eventId}/prep-packet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, entityId, depth: 'DETAILED' }),
      });
      window.location.reload();
    } catch {
      // Handle error
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
      <CollapsibleSection title="Attendee Profiles" items={packet.attendeeProfiles} />
      <CollapsibleSection title="Last Interactions" items={packet.lastInteractions} defaultOpen={false} />
      <CollapsibleSection title="Open Items" items={packet.openItems} />
      <CollapsibleSection title="Agenda" items={packet.agenda} />
      <CollapsibleSection title="Talking Points" items={packet.talkingPoints} />
      <CollapsibleSection title="Documents" items={packet.documents} defaultOpen={false} />

      {packet.suggestions.length > 0 && (
        <CollapsibleSection title="Suggestions" items={packet.suggestions} />
      )}

      {packet.riskFlags.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#dc2626', marginBottom: '4px' }}>Risk Flags</div>
          {packet.riskFlags.map((flag, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#dc2626', padding: '2px 0' }}>&#x26A0; {flag}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          style={{
            padding: '6px 12px', fontSize: '12px', border: '1px solid #d1d5db',
            borderRadius: '4px', cursor: 'pointer', background: '#fff',
          }}
        >
          {regenerating ? 'Regenerating...' : 'Regenerate'}
        </button>
        <button
          onClick={() => window.print()}
          style={{
            padding: '6px 12px', fontSize: '12px', border: '1px solid #d1d5db',
            borderRadius: '4px', cursor: 'pointer', background: '#fff',
          }}
        >
          Print
        </button>
      </div>
    </div>
  );
}
