'use client';

import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import type { CalendarEventDisplay, GeneratedPrepPacket } from '../calendar.types';
import { PrepPacketView } from './PrepPacketView';
import { PostMeetingForm } from './PostMeetingForm';

interface EventDetailPanelProps {
  event: CalendarEventDisplay | null;
  onClose: () => void;
  onEdit?: (eventId: string) => void;
  onDelete?: (eventId: string) => void;
}

export function EventDetailPanel({ event, onClose, onEdit, onDelete }: EventDetailPanelProps) {
  const [prepPacket, setPrepPacket] = useState<GeneratedPrepPacket | null>(null);
  const [showPostMeeting, setShowPostMeeting] = useState(false);
  const [loadingPrep, setLoadingPrep] = useState(false);

  useEffect(() => {
    if (event?.hasPrepPacket && event.id) {
      fetch(`/api/calendar/${event.id}/prep-packet`)
        .then((r) => r.json())
        .then((json) => { if (json.success) setPrepPacket(json.data); })
        .catch(() => {});
    } else {
      setPrepPacket(null);
    }
  }, [event?.id, event?.hasPrepPacket]);

  if (!event) return null;

  const startTime = new Date(event.startTime);
  const endTime = new Date(event.endTime);
  const duration = differenceInMinutes(endTime, startTime);
  const isPastEvent = endTime < new Date();

  const handleGeneratePrep = async () => {
    setLoadingPrep(true);
    try {
      const res = await fetch(`/api/calendar/${event.id}/prep-packet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, entityId: event.entityId, depth: 'STANDARD' }),
      });
      const json = await res.json();
      if (json.success) setPrepPacket(json.data);
    } catch {
      // Handle error
    } finally {
      setLoadingPrep(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this event?')) return;
    try {
      await fetch(`/api/calendar/${event.id}`, { method: 'DELETE' });
      onDelete?.(event.id);
      onClose();
    } catch {
      // Handle error
    }
  };

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      width: '400px',
      height: '100vh',
      background: '#fff',
      boxShadow: '-4px 0 12px rgba(0,0,0,0.1)',
      overflowY: 'auto',
      zIndex: 50,
      padding: '24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{event.title}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>
          &times;
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: event.entityColor }} />
        <span style={{ fontSize: '14px', color: '#6b7280' }}>{event.entityName}</span>
      </div>

      <div style={{ marginTop: '16px', fontSize: '14px' }}>
        <div><strong>Date:</strong> {format(startTime, 'EEEE, MMMM d, yyyy')}</div>
        <div><strong>Time:</strong> {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')} ({duration} min)</div>
      </div>

      {(event.bufferBefore || event.bufferAfter) && (
        <div style={{ marginTop: '12px', padding: '8px', background: '#f9fafb', borderRadius: '6px', fontSize: '13px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Buffers</div>
          {event.bufferBefore && <div>Before: {event.bufferBefore} min</div>}
          {event.bufferAfter && <div>After: {event.bufferAfter} min</div>}
        </div>
      )}

      {event.participantNames.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Participants</div>
          {event.participantNames.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%', background: '#e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 600,
              }}>
                {name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
              </div>
              <span style={{ fontSize: '13px' }}>{name}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Prep Packet</div>
        {prepPacket ? (
          <PrepPacketView packet={prepPacket} eventId={event.id} entityId={event.entityId} />
        ) : (
          <button
            onClick={handleGeneratePrep}
            disabled={loadingPrep}
            style={{
              padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px',
              background: '#fff', cursor: 'pointer', fontSize: '13px',
            }}
          >
            {loadingPrep ? 'Generating...' : 'Generate Prep Packet'}
          </button>
        )}
      </div>

      {event.meetingNotes && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Meeting Notes</div>
          <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', background: '#f9fafb', padding: '8px', borderRadius: '6px' }}>
            {event.meetingNotes}
          </div>
        </div>
      )}

      {isPastEvent && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => setShowPostMeeting(!showPostMeeting)}
            style={{
              padding: '8px 16px', border: '1px solid #3b82f6', borderRadius: '6px',
              background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '13px', width: '100%',
            }}
          >
            {showPostMeeting ? 'Hide Post-Meeting Form' : 'Capture Post-Meeting Notes'}
          </button>
          {showPostMeeting && (
            <div style={{ marginTop: '12px' }}>
              <PostMeetingForm eventId={event.id} entityId={event.entityId} onSaved={onClose} />
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onEdit?.(event.id)}
          style={{
            flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px',
            background: '#fff', cursor: 'pointer', fontSize: '13px',
          }}
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          style={{
            flex: 1, padding: '8px', border: '1px solid #fca5a5', borderRadius: '6px',
            background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '13px',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
