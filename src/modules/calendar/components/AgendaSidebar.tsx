'use client';

import { CalendarEventDisplay } from '@/modules/calendar/calendar.types';

interface AgendaSidebarProps {
  events: CalendarEventDisplay[];
  onEventClick: (event: CalendarEventDisplay) => void;
  onClose: () => void;
}

function formatTime(date: Date): string {
  const d = new Date(date);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHour}:${displayMinutes} ${ampm}`;
}

function computeDurationLabel(start: Date, end: Date): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const totalMinutes = Math.round((endMs - startMs) / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getColorDotClass(type: CalendarEventDisplay['type']): string {
  switch (type) {
    case 'MEETING':
      return 'bg-blue-500';
    case 'FOCUS_BLOCK':
      return 'bg-green-500';
    case 'PERSONAL':
      return 'bg-purple-500';
    case 'CALL':
      return 'bg-blue-400';
    default:
      return 'bg-gray-300';
  }
}

function computeFreeTime(events: CalendarEventDisplay[]): number {
  // Workday is 9 AM to 5 PM = 480 minutes total
  const WORKDAY_START_MINUTES = 9 * 60;
  const WORKDAY_END_MINUTES = 17 * 60;
  const WORKDAY_TOTAL_MINUTES = WORKDAY_END_MINUTES - WORKDAY_START_MINUTES;

  let coveredMinutes = 0;

  for (const event of events) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();

    const clampedStart = Math.max(startMins, WORKDAY_START_MINUTES);
    const clampedEnd = Math.min(endMins, WORKDAY_END_MINUTES);
    if (clampedEnd > clampedStart) {
      coveredMinutes += clampedEnd - clampedStart;
    }
  }

  const freeMinutes = Math.max(0, WORKDAY_TOTAL_MINUTES - coveredMinutes);
  return Math.round((freeMinutes / 60) * 10) / 10;
}

function computeFocusTime(events: CalendarEventDisplay[]): number {
  let totalMinutes = 0;
  for (const event of events) {
    if (event.type === 'FOCUS_BLOCK') {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      totalMinutes += Math.round((end.getTime() - start.getTime()) / 60000);
    }
  }
  return Math.round((totalMinutes / 60) * 10) / 10;
}

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isBetweenEvents(
  prevEvent: CalendarEventDisplay | null,
  nextEvent: CalendarEventDisplay | null,
  currentMinutes: number,
): boolean {
  const prevEndMins = prevEvent
    ? new Date(prevEvent.endTime).getHours() * 60 + new Date(prevEvent.endTime).getMinutes()
    : 0;
  const nextStartMins = nextEvent
    ? new Date(nextEvent.startTime).getHours() * 60 + new Date(nextEvent.startTime).getMinutes()
    : 24 * 60;
  return currentMinutes >= prevEndMins && currentMinutes < nextStartMins;
}

export default function AgendaSidebar({ events, onEventClick, onClose }: AgendaSidebarProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const freeHours = computeFreeTime(sorted);
  const focusHours = computeFocusTime(sorted);
  const FOCUS_GOAL = 4;
  const focusProgressPercent = Math.min(100, (focusHours / FOCUS_GOAL) * 100);

  const currentTimeMinutes = getCurrentTimeMinutes();

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">Today&#39;s Agenda</span>
        <button
          onClick={onClose}
          aria-label="Close agenda"
          className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 mt-4 text-center">No events today</p>
        )}

        {sorted.map((event, index) => {
          const prevEvent = index > 0 ? sorted[index - 1] : null;
          const showCurrentTimeIndicator = isBetweenEvents(prevEvent, event, currentTimeMinutes);

          return (
            <div key={event.id}>
              {/* Current time indicator between events */}
              {showCurrentTimeIndicator && (
                <div className="flex items-center gap-2 my-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <div className="flex-1 h-px bg-red-400 opacity-60" />
                </div>
              )}

              {/* Time label */}
              <div className="text-xs font-medium text-gray-500 mt-3">
                {formatTime(event.startTime)}
              </div>

              {/* Event card */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onEventClick(event)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onEventClick(event);
                  }
                }}
                className="flex items-start gap-2 py-2 px-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                {/* Color dot */}
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getColorDotClass(event.type)}`}
                  aria-hidden="true"
                />

                {/* Content */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate">{event.title}</span>
                  <span className="text-xs text-gray-500">
                    {computeDurationLabel(event.startTime, event.endTime)}
                  </span>

                  {/* Action row */}
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {event.hasPrepPacket && (
                      <span
                        role="link"
                        className="text-xs text-blue-600 hover:underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        tabIndex={0}
                        aria-label="Open prep packet"
                      >
                        📋 Prep
                      </span>
                    )}

                    {event.type === 'CALL' && (
                      <span
                        role="link"
                        className="text-xs text-blue-600 hover:underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        tabIndex={0}
                        aria-label="Join call"
                      >
                        📞 Join
                      </span>
                    )}

                    {event.type === 'FOCUS_BLOCK' && (
                      <span className="text-xs text-green-600 flex items-center gap-0.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Protected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Current time indicator after all events if current time is past all events */}
        {sorted.length > 0 &&
          isBetweenEvents(sorted[sorted.length - 1], null, currentTimeMinutes) && (
            <div className="flex items-center gap-2 my-2">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <div className="flex-1 h-px bg-red-400 opacity-60" />
            </div>
          )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500 space-y-2">
        <div className="flex justify-between items-center">
          <span>Free: {freeHours}h today</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span>
              Focus: {focusHours}h / {FOCUS_GOAL}h goal
            </span>
          </div>
          {/* Mini progress bar */}
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-1 bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${focusProgressPercent}%` }}
              aria-valuenow={focusHours}
              aria-valuemin={0}
              aria-valuemax={FOCUS_GOAL}
              role="progressbar"
              aria-label="Focus time progress"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
