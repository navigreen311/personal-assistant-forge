import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
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
  // Query real CalendarEvents for the user during the travel period
  const entity = await prisma.entity.findFirst({ where: { userId } });
  if (!entity) return [];

  const calendarEvents = await prisma.calendarEvent.findMany({
    where: {
      entityId: entity.id,
      startTime: { gte: travelStartDate },
      endTime: { lte: travelEndDate },
    },
    orderBy: { startTime: 'asc' },
  });

  // Default to user's home timezone (America/Chicago) for events without explicit timezone info
  const homeTimezone = 'America/Chicago';

  const adjustments: TimezoneAdjustment[] = calendarEvents.map((event: { id: string; title: string; startTime: Date }) => {
    const originalOffset = getOffset(homeTimezone);
    const travelOffset = getOffset(travelTimezone);
    const diffHours = travelOffset - originalOffset;

    const adjustedTime = new Date(event.startTime.getTime() + diffHours * 3600000);
    const adjustedHour = adjustedTime.getHours();

    // Conflict: event falls outside 7 AM - 11 PM in travel timezone
    const conflictDetected = adjustedHour < 7 || adjustedHour >= 23;

    return {
      eventId: event.id,
      eventTitle: event.title,
      originalTimezone: homeTimezone,
      travelTimezone,
      originalTime: event.startTime,
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

export function estimateJetLag(
  homeTimezone: string,
  travelTimezone: string
): { hoursDifference: number; adjustmentDays: number; severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' } {
  const homeOffset = getOffset(homeTimezone);
  const travelOffset = getOffset(travelTimezone);
  const hoursDifference = Math.abs(travelOffset - homeOffset);

  // Roughly 1 day per hour of time change for full adjustment
  const adjustmentDays = Math.ceil(hoursDifference);

  let severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
  if (hoursDifference === 0) {
    severity = 'NONE';
  } else if (hoursDifference <= 3) {
    severity = 'MILD';
  } else if (hoursDifference < 8) {
    severity = 'MODERATE';
  } else {
    severity = 'SEVERE';
  }

  return { hoursDifference, adjustmentDays, severity };
}

export function findOptimalMeetingTime(
  timezones: string[]
): { utcHour: number; localTimes: Record<string, string> } {
  const offsets = timezones.map(tz => ({ tz, offset: getOffset(tz) }));

  let bestHour = 0;
  let bestScore = -1;

  // Try each UTC hour and count how many timezones fall within 9 AM - 5 PM
  for (let utcHour = 0; utcHour < 24; utcHour++) {
    let score = 0;
    for (const { offset } of offsets) {
      const localHour = ((utcHour + offset) % 24 + 24) % 24;
      if (localHour >= 9 && localHour < 17) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestHour = utcHour;
    }
  }

  const localTimes: Record<string, string> = {};
  for (const { tz, offset } of offsets) {
    const localHour = ((bestHour + offset) % 24 + 24) % 24;
    const h = localHour.toString().padStart(2, '0');
    localTimes[tz] = `${h}:00`;
  }

  return { utcHour: bestHour, localTimes };
}
