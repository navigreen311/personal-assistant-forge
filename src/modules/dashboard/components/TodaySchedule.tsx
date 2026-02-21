'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ScheduleEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: 'meeting' | 'focus' | 'personal' | 'buffer';
  hasPrepPacket: boolean;
  entityName: string;
}

interface TodayScheduleProps {
  events: ScheduleEvent[];
}

const TYPE_CONFIG: Record<
  ScheduleEvent['type'],
  { dotColor: string; borderColor: string; icon?: string }
> = {
  meeting: { dotColor: 'bg-blue-500', borderColor: 'border-l-blue-500' },
  focus: { dotColor: 'bg-green-500', borderColor: 'border-l-green-500', icon: '🛡' },
  personal: { dotColor: 'bg-purple-500', borderColor: 'border-l-purple-500' },
  buffer: { dotColor: 'bg-gray-300', borderColor: 'border-l-gray-300' },
};

function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) {
    // Try parsing as "HH:MM" or "HH:MM:SS"
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const hour = parseInt(parts[0], 10);
      const minute = parseInt(parts[1], 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
    }
    return timeStr;
  }
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getMinutesFromMidnight(timeStr: string): number {
  const date = new Date(timeStr);
  if (!isNaN(date.getTime())) {
    return date.getHours() * 60 + date.getMinutes();
  }
  // Try parsing as "HH:MM" or "HH:MM:SS"
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return 0;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

function computeFreeHours(events: ScheduleEvent[]): number {
  const workdayMinutes = 8 * 60; // assume 8-hour workday
  const scheduledMinutes = events.reduce((sum, e) => sum + e.duration, 0);
  const freeMinutes = Math.max(0, workdayMinutes - scheduledMinutes);
  return Math.round((freeMinutes / 60) * 10) / 10;
}

export default function TodaySchedule({ events }: TodayScheduleProps) {
  const [currentMinutes, setCurrentMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    };
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...events].sort(
    (a, b) => getMinutesFromMidnight(a.startTime) - getMinutesFromMidnight(b.startTime)
  );

  const freeHours = computeFreeHours(events);

  // Compute timeline bounds for the current-time indicator
  const timelineStart =
    sorted.length > 0 ? getMinutesFromMidnight(sorted[0].startTime) : 9 * 60;
  const timelineEnd =
    sorted.length > 0
      ? getMinutesFromMidnight(sorted[sorted.length - 1].endTime) || timelineStart + 60
      : 17 * 60;
  const timelineSpan = Math.max(timelineEnd - timelineStart, 1);

  const showCurrentTime =
    currentMinutes >= timelineStart && currentMinutes <= timelineEnd;
  const currentTimePercent =
    ((currentMinutes - timelineStart) / timelineSpan) * 100;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Today&apos;s Schedule</h2>
        <Link
          href="/calendar"
          className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          View calendar →
        </Link>
      </div>

      {/* Body */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <span className="text-2xl mb-2">🎯</span>
          <p className="text-sm text-center">No events today — perfect for deep work</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline container */}
          <div className="relative">
            {/* Current time indicator */}
            {showCurrentTime && (
              <div
                className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
                style={{ top: `${currentTimePercent}%` }}
              >
                <div className="w-16 flex-shrink-0" />
                <div className="flex-1 ml-4 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
                  <div className="flex-1 border-t-2 border-red-500" />
                </div>
              </div>
            )}

            {/* Events */}
            {sorted.map((event, index) => {
              const config = TYPE_CONFIG[event.type];
              const isLast = index === sorted.length - 1;

              return (
                <div key={event.id} className="flex items-start py-2 relative">
                  {/* Vertical timeline line */}
                  {!isLast && (
                    <div
                      className="absolute left-[3.75rem] top-6 bottom-0 border-l-2 border-gray-200 z-0"
                      aria-hidden="true"
                    />
                  )}

                  {/* Time column */}
                  <div className="w-16 flex-shrink-0 text-right text-xs text-gray-500 font-medium pt-1 pr-2">
                    {formatTime(event.startTime)}
                  </div>

                  {/* Timeline dot */}
                  <div className="flex-shrink-0 flex items-start pt-1.5 z-10">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${config.dotColor} ring-2 ring-white`}
                    />
                  </div>

                  {/* Event card */}
                  <div
                    className={`flex-1 ml-3 bg-gray-50 rounded-md border-l-4 ${config.borderColor} px-3 py-2 min-w-0`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {config.icon && (
                            <span className="text-xs leading-none">{config.icon}</span>
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {event.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">
                            {formatDuration(event.duration)}
                          </span>
                          {event.entityName && (
                            <span className="text-xs text-gray-400 truncate">
                              · {event.entityName}
                            </span>
                          )}
                        </div>
                      </div>
                      {event.hasPrepPacket && (
                        <Link
                          href={`/calendar/prep/${event.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 flex-shrink-0 transition-colors"
                        >
                          Prep
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      {sorted.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">Free: {freeHours}h today</span>
        </div>
      )}
    </div>
  );
}
