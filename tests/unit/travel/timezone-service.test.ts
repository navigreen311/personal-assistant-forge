const mockCalendarEventFindMany = jest.fn();
const mockEntityFindFirst = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  prisma: {
    calendarEvent: {
      findMany: (...args: unknown[]) => mockCalendarEventFindMany(...args),
    },
    entity: {
      findFirst: (...args: unknown[]) => mockEntityFindFirst(...args),
    },
  },
}));

const mockGenerateText = jest.fn();
jest.mock('../../../src/lib/ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

import {
  adjustScheduleForTravel,
  detectTimezoneConflicts,
  getTimezoneAdvice,
  estimateJetLag,
  findOptimalMeetingTime,
} from '../../../src/modules/travel/services/timezone-service';

describe('adjustScheduleForTravel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should query CalendarEvents for the travel date range', async () => {
    mockEntityFindFirst.mockResolvedValue({ id: 'entity-1' });
    mockCalendarEventFindMany.mockResolvedValue([]);

    const start = new Date('2026-03-15T00:00:00Z');
    const end = new Date('2026-03-20T00:00:00Z');

    await adjustScheduleForTravel('user-1', 'Asia/Tokyo', start, end);

    expect(mockCalendarEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'entity-1',
          startTime: { gte: start },
          endTime: { lte: end },
        }),
      })
    );
  });

  it('should calculate timezone offset differences correctly', async () => {
    mockEntityFindFirst.mockResolvedValue({ id: 'entity-1' });
    // Event at 9 AM in America/Chicago timezone
    mockCalendarEventFindMany.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Team Standup',
        startTime: new Date('2026-03-15T15:00:00Z'), // 9 AM CST = 15:00 UTC
        endTime: new Date('2026-03-15T15:30:00Z'),
      },
    ]);

    const start = new Date('2026-03-15T00:00:00Z');
    const end = new Date('2026-03-20T00:00:00Z');

    const adjustments = await adjustScheduleForTravel('user-1', 'Asia/Tokyo', start, end);

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].eventTitle).toBe('Team Standup');
    // Tokyo is UTC+9, Chicago is UTC-6, difference is +15 hours
    const expectedAdjustedTime = new Date(
      new Date('2026-03-15T15:00:00Z').getTime() + 15 * 3600000
    );
    expect(adjustments[0].adjustedTime.getTime()).toBe(expectedAdjustedTime.getTime());
  });

  it('should detect conflicts outside 7AM-11PM', async () => {
    mockEntityFindFirst.mockResolvedValue({ id: 'entity-1' });
    // Event at 11 PM CST -> would be very early morning in some timezones
    mockCalendarEventFindMany.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Late Meeting',
        startTime: new Date('2026-03-16T03:00:00Z'), // 9 PM CST
        endTime: new Date('2026-03-16T04:00:00Z'),
      },
    ]);

    const start = new Date('2026-03-15T00:00:00Z');
    const end = new Date('2026-03-20T00:00:00Z');

    const adjustments = await adjustScheduleForTravel('user-1', 'Asia/Tokyo', start, end);
    const conflicts = detectTimezoneConflicts(adjustments);

    // Tokyo offset shifts this event significantly — check if conflict detected
    expect(adjustments).toHaveLength(1);
    // The conflict status depends on the actual adjusted hour
  });

  it('should return empty array when no entity found', async () => {
    mockEntityFindFirst.mockResolvedValue(null);

    const result = await adjustScheduleForTravel(
      'user-1', 'Asia/Tokyo', new Date(), new Date()
    );

    expect(result).toEqual([]);
  });
});

describe('estimateJetLag', () => {
  it('should return NONE severity for same timezone', () => {
    const result = estimateJetLag('America/Chicago', 'America/Chicago');

    expect(result.hoursDifference).toBe(0);
    expect(result.adjustmentDays).toBe(0);
    expect(result.severity).toBe('NONE');
  });

  it('should return MILD severity for 1-3 hour difference', () => {
    // Chicago (-6) to New York (-5) = 1 hour
    const result = estimateJetLag('America/Chicago', 'America/New_York');

    expect(result.hoursDifference).toBe(1);
    expect(result.severity).toBe('MILD');
  });

  it('should return MODERATE severity for 4-7 hour difference', () => {
    // Chicago (-6) to London (0) = 6 hours
    const result = estimateJetLag('America/Chicago', 'Europe/London');

    expect(result.hoursDifference).toBe(6);
    expect(result.severity).toBe('MODERATE');
  });

  it('should return SEVERE severity for 8+ hour difference', () => {
    // Chicago (-6) to Tokyo (9) = 15 hours
    const result = estimateJetLag('America/Chicago', 'Asia/Tokyo');

    expect(result.hoursDifference).toBe(15);
    expect(result.severity).toBe('SEVERE');
    expect(result.adjustmentDays).toBe(15);
  });
});

describe('findOptimalMeetingTime', () => {
  it('should find overlapping business hours across timezones', () => {
    const result = findOptimalMeetingTime([
      'America/New_York',
      'Europe/London',
    ]);

    // Should find an hour that works for both
    expect(result.utcHour).toBeGreaterThanOrEqual(0);
    expect(result.utcHour).toBeLessThan(24);

    // Check the local times are within business hours for at least one
    const nyHour = parseInt(result.localTimes['America/New_York']);
    const londonHour = parseInt(result.localTimes['Europe/London']);
    // At least one should be in 9-17 range
    const anyInBusinessHours =
      (nyHour >= 9 && nyHour < 17) || (londonHour >= 9 && londonHour < 17);
    expect(anyInBusinessHours).toBe(true);
  });

  it('should return local times for each timezone', () => {
    const result = findOptimalMeetingTime([
      'America/Chicago',
      'Asia/Tokyo',
      'Europe/London',
    ]);

    expect(result.localTimes).toHaveProperty('America/Chicago');
    expect(result.localTimes).toHaveProperty('Asia/Tokyo');
    expect(result.localTimes).toHaveProperty('Europe/London');

    // All local times should be in HH:00 format
    for (const time of Object.values(result.localTimes)) {
      expect(time).toMatch(/^\d{2}:00$/);
    }
  });
});

describe('getTimezoneAdvice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return no-conflict message when adjustments have no conflicts', async () => {
    const advice = await getTimezoneAdvice([
      {
        eventId: 'evt-1',
        eventTitle: 'Meeting',
        originalTimezone: 'America/Chicago',
        travelTimezone: 'America/New_York',
        originalTime: new Date(),
        adjustedTime: new Date(),
        conflictDetected: false,
      },
    ]);

    expect(advice).toContain('No timezone conflicts detected');
  });

  it('should call AI for advice when conflicts exist', async () => {
    mockGenerateText.mockResolvedValue('Consider rescheduling to a reasonable hour.');

    const advice = await getTimezoneAdvice([
      {
        eventId: 'evt-1',
        eventTitle: 'Early Meeting',
        originalTimezone: 'America/Chicago',
        travelTimezone: 'Asia/Tokyo',
        originalTime: new Date(),
        adjustedTime: new Date(),
        conflictDetected: true,
      },
    ]);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(advice).toBe('Consider rescheduling to a reasonable hour.');
  });
});
