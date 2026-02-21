'use client';

import { useState, useEffect } from 'react';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, getHours } from 'date-fns';
import type { CalendarViewMode, CalendarViewData, CalendarEventDisplay } from '../calendar.types';
import { EventCard } from './EventCard';
import { EnergyOverlay } from './EnergyOverlay';

interface CalendarViewProps {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  date: Date;
  onDateChange: (date: Date) => void;
  entityId?: string;
  onEventClick?: (event: CalendarEventDisplay) => void;
  onSlotClick?: (start: Date) => void;
  showEnergyOverlay?: boolean;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm

export function CalendarView({
  viewMode,
  onViewModeChange,
  date,
  onDateChange,
  onEventClick,
  onSlotClick,
  showEnergyOverlay = false,
}: CalendarViewProps) {
  const [viewData, setViewData] = useState<CalendarViewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          viewMode,
          date: date.toISOString(),
        });
        const res = await fetch(`/api/calendar?${params}`);
        const json = await res.json();
        if (json.success) setViewData(json.data);
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [viewMode, date]);

  const navigatePrev = () => {
    if (viewMode === 'day') onDateChange(subDays(date, 1));
    else if (viewMode === 'week') onDateChange(subWeeks(date, 1));
    else onDateChange(subMonths(date, 1));
  };

  const navigateNext = () => {
    if (viewMode === 'day') onDateChange(addDays(date, 1));
    else if (viewMode === 'week') onDateChange(addWeeks(date, 1));
    else onDateChange(addMonths(date, 1));
  };

  const getEventsForDayAndHour = (day: Date, hour: number): CalendarEventDisplay[] => {
    if (!viewData) return [];
    return viewData.events.filter((e) => {
      const eventStart = new Date(e.startTime);
      return isSameDay(eventStart, day) && getHours(eventStart) === hour;
    });
  };

  const getEventsForDay = (day: Date): CalendarEventDisplay[] => {
    if (!viewData) return [];
    return viewData.events.filter((e) => isSameDay(new Date(e.startTime), day));
  };

  const renderHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: viewMode === mode ? '#3b82f6' : '#fff',
              color: viewMode === mode ? '#fff' : '#374151',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontSize: '14px',
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={navigatePrev} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: '#fff' }}>
          &lt;
        </button>
        <span style={{ fontWeight: 600, minWidth: '200px', textAlign: 'center' }}>
          {viewMode === 'day' && format(date, 'EEEE, MMMM d, yyyy')}
          {viewMode === 'week' && `${format(startOfWeek(date, { weekStartsOn: 1 }), 'MMM d')} - ${format(endOfWeek(date, { weekStartsOn: 1 }), 'MMM d, yyyy')}`}
          {viewMode === 'month' && format(date, 'MMMM yyyy')}
        </span>
        <button onClick={navigateNext} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: '#fff' }}>
          &gt;
        </button>
        <button
          onClick={() => onDateChange(new Date())}
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: '#fff', fontSize: '14px' }}
        >
          Today
        </button>
      </div>
    </div>
  );

  const renderDayView = () => (
    <div style={{ position: 'relative' }}>
      {showEnergyOverlay && viewData?.energyOverlay && (
        <EnergyOverlay mappings={viewData.energyOverlay} hours={HOURS} columns={1} />
      )}
      {HOURS.map((hour) => {
        const events = getEventsForDayAndHour(date, hour);
        return (
          <div
            key={hour}
            onClick={() => {
              const slotStart = new Date(date);
              slotStart.setHours(hour, 0, 0, 0);
              onSlotClick?.(slotStart);
            }}
            style={{
              display: 'flex',
              minHeight: '60px',
              borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer',
            }}
          >
            <div style={{ width: '80px', padding: '4px 8px', color: '#6b7280', fontSize: '12px', flexShrink: 0 }}>
              {format(new Date(2000, 0, 1, hour), 'h a')}
            </div>
            <div style={{ flex: 1, padding: '2px 4px', position: 'relative' }}>
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => onEventClick?.(event)}
                />
              ))}
            </div>
          </div>
        );
      })}
      {isToday(date) && <CurrentTimeIndicator />}
    </div>
  );

  const renderWeekView = () => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ width: '80px', flexShrink: 0 }} />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '8px',
                fontWeight: isToday(day) ? 700 : 400,
                color: isToday(day) ? '#3b82f6' : '#374151',
                fontSize: '13px',
              }}
            >
              {format(day, 'EEE d')}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          {showEnergyOverlay && viewData?.energyOverlay && (
            <EnergyOverlay mappings={viewData.energyOverlay} hours={HOURS} columns={7} />
          )}
          {HOURS.map((hour) => (
            <div key={hour} style={{ display: 'flex', minHeight: '50px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '80px', padding: '2px 8px', color: '#6b7280', fontSize: '11px', flexShrink: 0 }}>
                {format(new Date(2000, 0, 1, hour), 'h a')}
              </div>
              {days.map((day) => {
                const events = getEventsForDayAndHour(day, hour);
                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => {
                      const slotStart = new Date(day);
                      slotStart.setHours(hour, 0, 0, 0);
                      onSlotClick?.(slotStart);
                    }}
                    style={{
                      flex: 1,
                      borderLeft: '1px solid #f3f4f6',
                      padding: '1px 2px',
                      cursor: 'pointer',
                    }}
                  >
                    {events.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        compact
                        onClick={() => onEventClick?.(event)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const allDays = eachDayOfInterval({ start: calStart, end: calEnd });
    const weeks: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e5e7eb' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{ textAlign: 'center', padding: '8px', fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {week.map((day) => {
              const events = getEventsForDay(day);
              const isCurrentMonth = day.getMonth() === date.getMonth();
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => {
                    onDateChange(day);
                    onViewModeChange('day');
                  }}
                  style={{
                    minHeight: '80px',
                    border: '1px solid #f3f4f6',
                    padding: '4px',
                    cursor: 'pointer',
                    opacity: isCurrentMonth ? 1 : 0.4,
                    background: isToday(day) ? '#eff6ff' : '#fff',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: isToday(day) ? 700 : 400, color: isToday(day) ? '#3b82f6' : '#374151' }}>
                    {format(day, 'd')}
                  </div>
                  {events.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      style={{
                        fontSize: '10px',
                        padding: '1px 4px',
                        marginTop: '1px',
                        borderRadius: '2px',
                        background: event.entityColor + '20',
                        borderLeft: `2px solid ${event.entityColor}`,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                  {events.length > 3 && (
                    <div style={{ fontSize: '10px', color: '#6b7280' }}>+{events.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Loading calendar...
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}>
      {renderHeader()}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'month' && renderMonthView()}
    </div>
  );
}

function CurrentTimeIndicator() {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const top = (hour - 6) * 60 + minutes; // offset from 6am
  if (hour < 6 || hour > 22) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: '80px',
        right: 0,
        top: `${top}px`,
        height: '2px',
        background: '#ef4444',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', position: 'absolute', left: '-4px', top: '-3px' }} />
    </div>
  );
}
