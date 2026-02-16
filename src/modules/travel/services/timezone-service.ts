import { generateText } from '@/lib/ai';
import type { TimezoneAdjustment } from '../types';

// Simplified timezone offset map (UTC offset in hours)
const timezoneOffsets: Record<string, number> = {
  'America/New_York': -5,
  'America/Chicago': -6,
  'America/Denver': -7,
  'America/Los_Angeles': -8,
  'Europe/London': 0,
  'Europe/Paris': 1,
  'Europe/Berlin': 1,
  'Asia/Tokyo': 9,
  'Asia/Shanghai': 8,
  'Asia/Dubai': 4,
  'Asia/Kolkata': 5.5,
  'Australia/Sydney': 11,
  'Pacific/Auckland': 13,
  'America/Sao_Paulo': -3,
  'America/Mexico_City': -6,
};

function getOffset(tz: string): number {
  return timezoneOffsets[tz] ?? 0;
}

export async function adjustScheduleForTravel(
  userId: string,
  travelTimezone: string,
  travelStartDate: Date,
  travelEndDate: Date
): Promise<TimezoneAdjustment[]> {
  // Simulate calendar events during travel period
  const mockEvents = [
    { id: 'evt-1', title: 'Team Standup', time: new Date(travelStartDate.getTime() + 9 * 3600000), timezone: 'America/Chicago' },
    { id: 'evt-2', title: 'Client Call', time: new Date(travelStartDate.getTime() + 14 * 3600000), timezone: 'America/Chicago' },
    { id: 'evt-3', title: 'Board Meeting', time: new Date(travelStartDate.getTime() + 24 * 3600000 + 10 * 3600000), timezone: 'America/Chicago' },
  ];

  const adjustments: TimezoneAdjustment[] = mockEvents.map(event => {
    const originalOffset = getOffset(event.timezone);
    const travelOffset = getOffset(travelTimezone);
    const diffHours = travelOffset - originalOffset;

    const adjustedTime = new Date(event.time.getTime() + diffHours * 3600000);
    const adjustedHour = adjustedTime.getHours();

    // Conflict: event falls outside 7 AM - 11 PM in travel timezone
    const conflictDetected = adjustedHour < 7 || adjustedHour >= 23;

    return {
      eventId: event.id,
      eventTitle: event.title,
      originalTimezone: event.timezone,
      travelTimezone,
      originalTime: event.time,
      adjustedTime,
      conflictDetected,
    };
  });

  return adjustments;
}

export function detectTimezoneConflicts(
  adjustments: TimezoneAdjustment[]
): TimezoneAdjustment[] {
  return adjustments.filter(adj => adj.conflictDetected);
}

export async function getTimezoneAdvice(
  adjustments: TimezoneAdjustment[]
): Promise<string> {
  const conflicts = detectTimezoneConflicts(adjustments);
  if (conflicts.length === 0) {
    return 'No timezone conflicts detected. Your schedule is compatible with your travel timezone.';
  }

  try {
    const advice = await generateText(
      `I'm traveling and have the following calendar conflicts due to timezone differences:

${conflicts.map(c => `- "${c.eventTitle}" originally at ${c.originalTime.toISOString()} (${c.originalTimezone}) would be at ${c.adjustedTime.toISOString()} in ${c.travelTimezone}`).join('\n')}

Provide brief, practical advice on how to handle these timezone conflicts (e.g., reschedule, attend virtually, decline).`,
      {
        temperature: 0.7,
        system: 'You are a productivity assistant helping travelers manage timezone-related scheduling conflicts. Be concise and practical.',
      }
    );
    return advice;
  } catch {
    return `${conflicts.length} timezone conflict(s) detected. Consider rescheduling events that fall outside reasonable hours in your travel timezone.`;
  }
}
