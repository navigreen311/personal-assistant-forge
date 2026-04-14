'use client';

import { useState, useEffect } from 'react';
import { useShadowPageMap } from '@/hooks/useShadowPageMap';
import { format, isSameDay, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { CalendarView } from '@/modules/calendar/components/CalendarView';
import { EventDetailPanel } from '@/modules/calendar/components/EventDetailPanel';
import { ScheduleWizard } from '@/modules/calendar/components/ScheduleWizard';
import { AnalyticsDashboard as AnalyticsPanel } from '@/modules/calendar/components/AnalyticsDashboard';
import type { CalendarViewMode, CalendarEventDisplay } from '@/modules/calendar/calendar.types';

// ---------------------------------------------------------------------------
// AgendaSidebar — local component, no separate file required
// ---------------------------------------------------------------------------

interface AgendaSidebarProps {
  date: Date;
  events: CalendarEventDisplay[];
  onEventClick: (event: CalendarEventDisplay) => void;
}

function AgendaSidebar({ date, events, onEventClick }: AgendaSidebarProps) {
  const todayEvents = events
    .filter((e) => isSameDay(new Date(e.startTime), date))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // Calculate free time in the working day (8am – 6pm = 600 min)
  const workDayStart = 8 * 60;
  const workDayEnd = 18 * 60;
  const busyMinutes = todayEvents.reduce((acc, e) => {
    const start = new Date(e.startTime);
    const end = new Date(e.endTime);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const overlap = Math.max(
      0,
      Math.min(endMin, workDayEnd) - Math.max(startMin, workDayStart),
    );
    return acc + overlap;
  }, 0);
  const freeMinutes = Math.max(0, workDayEnd - workDayStart - busyMinutes);
  const freeHours = Math.floor(freeMinutes / 60);
  const freeRemainder = freeMinutes % 60;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="text-sm font-semibold text-gray-800">
          {format(date, 'EEEE, MMM d')}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {freeHours}h {freeRemainder}m free today
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {todayEvents.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No events today
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayEvents.map((event) => {
              const startTime = new Date(event.startTime);
              const endTime = new Date(event.endTime);
              const duration = differenceInMinutes(endTime, startTime);

              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left rounded-lg border border-gray-100 p-3 hover:border-gray-300 hover:shadow-sm transition-all group"
                  style={{ borderLeftWidth: '3px', borderLeftColor: event.entityColor }}
                >
                  {/* Time row */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">
                      {format(startTime, 'h:mm a')} – {format(endTime, 'h:mm a')}
                    </span>
                    <span className="text-xs text-gray-400">{duration}m</span>
                  </div>

                  {/* Title */}
                  <div className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600">
                    {event.title}
                  </div>

                  {/* Entity + badges */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">{event.entityName}</span>
                    {event.hasPrepPacket && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                        Prep
                      </span>
                    )}
                    {event.hasConflict && (
                      <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">
                        Conflict
                      </span>
                    )}
                    {event.isInFocusBlock && (
                      <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-medium">
                        Focus
                      </span>
                    )}
                  </div>

                  {/* Participants */}
                  {event.participantNames.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {event.participantNames.slice(0, 3).join(', ')}
                      {event.participantNames.length > 3 && ` +${event.participantNames.length - 3}`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer summary */}
      <div className="border-t border-gray-100 px-4 py-2 flex-shrink-0">
        <div className="text-xs text-gray-500">
          {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} scheduled
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarPage
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');

  useShadowPageMap({
    pageId: 'calendar',
    title: 'Calendar',
    description: 'Events, schedule, availability, meeting prep',
    visibleObjects: [],
    availableActions: [
      { id: 'show_today', label: "Today's schedule", voiceTriggers: ["what's on my calendar", 'today'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
      { id: 'find_free_time', label: 'Find free time', voiceTriggers: ['find free time', 'when am i free'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
      { id: 'create_event', label: 'Create event', voiceTriggers: ['create event', 'schedule meeting', 'new event'], confirmationLevel: 'tap', reversible: true, blastRadius: 'self' },
    ],
    activeFilters: {},
    activeEntity: null,
  });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDisplay | null>(null);
  const [showScheduleWizard, setShowScheduleWizard] = useState(false);
  const [showEnergyOverlay, setShowEnergyOverlay] = useState(false);
  const [entityFilter, _setEntityFilter] = useState<string | undefined>(undefined);
  const [showAgendaSidebar, setShowAgendaSidebar] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [todayEvents, setTodayEvents] = useState<CalendarEventDisplay[]>([]);

  // Fetch today's events for the agenda sidebar
  useEffect(() => {
    async function fetchTodayEvents() {
      try {
        const today = new Date();
        const params = new URLSearchParams({
          viewMode: 'day',
          date: today.toISOString(),
        });
        const res = await fetch(`/api/calendar?${params}`);
        const json = await res.json();
        if (json.success && json.data?.events) {
          const start = startOfDay(today);
          const end = endOfDay(today);
          const filtered: CalendarEventDisplay[] = (json.data.events as CalendarEventDisplay[]).filter(
            (e) => {
              const t = new Date(e.startTime).getTime();
              return t >= start.getTime() && t <= end.getTime();
            },
          );
          setTodayEvents(filtered);
        }
      } catch {
        // Fail silently
      }
    }
    fetchTodayEvents();
  }, []);

  // Analytics date range: current week Mon–Sun
  const analyticsStartDate = format(
    new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - currentDate.getDay() + 1),
    'yyyy-MM-dd',
  );
  const analyticsEndDate = format(
    new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - currentDate.getDay() + 7),
    'yyyy-MM-dd',
  );

  const handleEventClick = (event: CalendarEventDisplay) => {
    setSelectedEvent(event);
    setShowScheduleWizard(false);
  };

  const handleSlotClick = (_start: Date) => {
    setShowScheduleWizard(true);
    setSelectedEvent(null);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* ------------------------------------------------------------------ */}
      {/* Top Bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex justify-between items-center px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        {/* Left: title */}
        <h1 className="text-xl font-bold text-gray-900 m-0">Calendar</h1>

        {/* Center: view mode switcher */}
        <div className="flex gap-1.5">
          {(['day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={[
                'px-3 py-1.5 rounded-md border text-sm capitalize transition-colors',
                viewMode === mode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {/* Energy overlay toggle */}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEnergyOverlay}
              onChange={(e) => setShowEnergyOverlay(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-blue-600"
            />
            Energy Overlay
          </label>

          {/* Agenda sidebar toggle */}
          <button
            onClick={() => setShowAgendaSidebar(!showAgendaSidebar)}
            className={[
              'px-3 py-2 rounded-lg border text-sm transition-colors',
              showAgendaSidebar
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
            ].join(' ')}
            title="Toggle Agenda Sidebar"
          >
            Agenda
          </button>

          {/* Schedule Event */}
          <button
            onClick={() => setShowScheduleWizard(!showScheduleWizard)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Schedule Event
          </button>

          {/* Analytics */}
          <button
            onClick={() => setShowAnalytics(true)}
            className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Analytics
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main Content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar / Wizard area */}
        <div className="flex-1 overflow-auto p-4">
          {showScheduleWizard ? (
            <div className="max-w-2xl mx-auto px-6 py-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900 m-0">Schedule an Event</h2>
                <button
                  onClick={() => setShowScheduleWizard(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none bg-transparent border-none cursor-pointer p-1"
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

        {/* Agenda Sidebar */}
        {showAgendaSidebar && (
          <div className="w-80 border-l border-gray-200 flex-shrink-0 overflow-hidden">
            <AgendaSidebar
              date={currentDate}
              events={todayEvents}
              onEventClick={handleEventClick}
            />
          </div>
        )}

        {/* Event Detail Panel (existing — fixed overlay from EventDetailPanel itself) */}
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onEdit={() => {}}
            onDelete={() => setSelectedEvent(null)}
          />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Analytics Modal / Overlay                                          */}
      {/* ------------------------------------------------------------------ */}
      {showAnalytics && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAnalytics(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 m-0">Schedule Analytics</h2>
              <button
                onClick={() => setShowAnalytics(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none bg-transparent border-none cursor-pointer p-1"
              >
                &times;
              </button>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnalyticsPanel
                startDate={analyticsStartDate}
                endDate={analyticsEndDate}
                entityId={entityFilter}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
