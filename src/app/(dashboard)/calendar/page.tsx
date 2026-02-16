'use client';

import { useState } from 'react';
import { CalendarView } from '@/modules/calendar/components/CalendarView';
import { EventDetailPanel } from '@/modules/calendar/components/EventDetailPanel';
import { ScheduleWizard } from '@/modules/calendar/components/ScheduleWizard';
import type { CalendarViewMode, CalendarEventDisplay } from '@/modules/calendar/calendar.types';

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDisplay | null>(null);
  const [showScheduleWizard, setShowScheduleWizard] = useState(false);
  const [showEnergyOverlay, setShowEnergyOverlay] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string | undefined>(undefined);

  const handleEventClick = (event: CalendarEventDisplay) => {
    setSelectedEvent(event);
    setShowScheduleWizard(false);
  };

  const handleSlotClick = (_start: Date) => {
    setShowScheduleWizard(true);
    setSelectedEvent(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff',
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Calendar</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showEnergyOverlay}
              onChange={(e) => setShowEnergyOverlay(e.target.checked)}
            />
            Energy Overlay
          </label>
          <button
            onClick={() => setShowScheduleWizard(!showScheduleWizard)}
            style={{
              padding: '8px 16px', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            + Schedule Event
          </button>
          <a
            href="/calendar/analytics"
            style={{
              padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px',
              textDecoration: 'none', color: '#374151', fontSize: '14px',
            }}
          >
            Analytics
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {showScheduleWizard ? (
            <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Schedule an Event</h2>
                <button
                  onClick={() => setShowScheduleWizard(false)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
                >
                  &times;
                </button>
              </div>
              <ScheduleWizard
                entityId={entityFilter}
                onScheduled={() => {
                  setShowScheduleWizard(false);
                  setCurrentDate(new Date(currentDate)); // force refresh
                }}
              />
            </div>
          ) : (
            <CalendarView
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              date={currentDate}
              onDateChange={setCurrentDate}
              entityId={entityFilter}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              showEnergyOverlay={showEnergyOverlay}
            />
          )}
        </div>

        {/* Event Detail Sidebar */}
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onEdit={() => {}}
            onDelete={() => setSelectedEvent(null)}
          />
        )}
      </div>
    </div>
  );
}
