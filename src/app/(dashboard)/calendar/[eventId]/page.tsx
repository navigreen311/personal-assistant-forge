'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { EventDetailPanel } from '@/modules/calendar/components/EventDetailPanel';
import type { CalendarEventDisplay } from '@/modules/calendar/calendar.types';

export default function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<CalendarEventDisplay | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvent() {
      try {
        const res = await fetch(`/api/calendar/${eventId}`);
        const json = await res.json();
        if (json.success) {
          setEvent({
            ...json.data,
            entityName: 'Entity',
            entityColor: '#3b82f6',
            type: 'MEETING',
            participantNames: [],
            hasConflict: false,
            hasPrepPacket: !!json.data.prepPacket,
            isInFocusBlock: false,
          });
        }
      } catch {
        // Handle error
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [eventId]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading event...</div>;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <Link
        href="/calendar"
        style={{ display: 'inline-block', marginBottom: '16px', color: '#3b82f6', textDecoration: 'none', fontSize: '14px' }}
      >
        &larr; Back to Calendar
      </Link>

      {event ? (
        <div style={{ position: 'relative' }}>
          <EventDetailPanel
            event={event}
            onClose={() => window.history.back()}
            onEdit={() => {}}
            onDelete={() => window.location.href = '/calendar'}
          />
        </div>
      ) : (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Event not found.</div>
      )}
    </div>
  );
}
