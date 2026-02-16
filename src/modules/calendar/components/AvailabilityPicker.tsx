'use client';

import { useState, useEffect, useCallback } from 'react';

interface FreeSlot {
  start: string;
  end: string;
}

interface BusySlot {
  start: string;
  end: string;
  title: string;
  eventId: string;
}

interface AvailabilityData {
  totalEvents: number;
  freeSlots: FreeSlot[];
  busySlots: BusySlot[];
}

interface AvailabilityPickerProps {
  startDate: string;
  endDate: string;
  entityId?: string;
  onSlotSelect?: (slot: FreeSlot) => void;
}

export function AvailabilityPicker({ startDate, endDate, entityId, onSlotSelect }: AvailabilityPickerProps) {
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (entityId) params.set('entityId', entityId);
      const res = await fetch(`/api/calendar/availability?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error?.message ?? 'Failed to fetch availability');
      }
    } catch {
      setError('Failed to fetch availability');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, entityId]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchAvailability();
    }
  }, [startDate, endDate, fetchAvailability]);

  const handleSelect = (slot: FreeSlot) => {
    setSelectedSlot(slot);
    onSlotSelect?.(slot);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const durationMinutes = (start: string, end: string) => {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  };

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading availability...</div>;
  }

  if (error) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  }

  if (!data) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Select a date range to view availability.</div>;
  }

  // Group free slots by day
  const slotsByDay = new Map<string, FreeSlot[]>();
  for (const slot of data.freeSlots) {
    const dayKey = formatDate(slot.start);
    const existing = slotsByDay.get(dayKey) ?? [];
    existing.push(slot);
    slotsByDay.set(dayKey, existing);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
        <div style={{ padding: '12px 16px', background: '#ecfdf5', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>{data.freeSlots.length}</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Free Slots</div>
        </div>
        <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>{data.totalEvents}</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Busy Events</div>
        </div>
      </div>

      {data.freeSlots.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: '8px' }}>
          No free slots available in this range.
        </div>
      ) : (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Available Slots</h3>
          {Array.from(slotsByDay.entries()).map(([day, slots]) => (
            <div key={day} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>{day}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {slots.map((slot, i) => {
                  const mins = durationMinutes(slot.start, slot.end);
                  const isSelected = selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(slot)}
                      style={{
                        padding: '8px 12px',
                        border: isSelected ? '2px solid #3b82f6' : '1px solid #d1d5db',
                        borderRadius: '6px',
                        background: isSelected ? '#eff6ff' : '#fff',
                        cursor: 'pointer',
                        fontSize: '13px',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>
                        {formatTime(slot.start)} - {formatTime(slot.end)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{mins} min</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.busySlots.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Busy Slots</h3>
          {data.busySlots.map((slot, i) => (
            <div
              key={i}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderLeft: '3px solid #ef4444', marginBottom: '6px',
                background: '#fef2f2', borderRadius: '0 6px 6px 0', fontSize: '13px',
              }}
            >
              <span style={{ fontWeight: 500 }}>{slot.title}</span>
              <span style={{ color: '#6b7280' }}>
                {formatDate(slot.start)} {formatTime(slot.start)} - {formatTime(slot.end)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
