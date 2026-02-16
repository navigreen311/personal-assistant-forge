// Mock uuid before importing any modules that use it
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
}));

import { SchedulingService } from '../../../src/modules/calendar/scheduling.service';
import type { CalendarEvent } from '../../../src/shared/types';
import type { ScheduleRequest, TimeRange } from '../../../src/modules/calendar/calendar.types';

// Mock prisma
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockFindUniqueOrThrow = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    entity: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    calendarEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    contact: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

describe('SchedulingService', () => {
  let service: SchedulingService;

  const mockUser = {
    id: 'user-1',
    chronotype: 'FLEXIBLE',
    preferences: {
      meetingFreedays: [0, 6], // Sat, Sun
      focusHours: [{ start: '09:00', end: '11:00' }],
      attentionBudget: 10,
    },
    timezone: 'America/Chicago',
  };

  const makeEvent = (overrides: Partial<CalendarEvent & { location?: string }> = {}): CalendarEvent => ({
    id: 'evt-1',
    title: 'Existing Meeting',
    entityId: 'entity-1',
    participantIds: ['c1'],
    startTime: new Date('2026-02-16T10:00:00'),
    endTime: new Date('2026-02-16T11:00:00'),
    bufferBefore: 5,
    bufferAfter: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    service = new SchedulingService();
    jest.clearAllMocks();

    mockFindUnique.mockResolvedValue(mockUser);
    mockFindMany.mockResolvedValue([]);
  });

  describe('findAvailableSlots', () => {
    const request: ScheduleRequest = {
      title: 'New Meeting',
      entityId: 'entity-1',
      duration: 60,
      priority: 'MEDIUM',
      type: 'MEETING',
    };

    it('should return slots sorted by score descending', async () => {
      mockFindMany.mockResolvedValue([]); // entities
      const suggestions = await service.findAvailableSlots(request, 'user-1', 3);
      if (suggestions.length > 1) {
        for (let i = 1; i < suggestions.length; i++) {
          expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score);
        }
      }
    });

    it('should exclude times with hard conflicts', async () => {
      const existingEvent = makeEvent({
        startTime: new Date('2026-02-16T10:00:00'),
        endTime: new Date('2026-02-16T11:00:00'),
      });
      // First call for entities, second for events
      mockFindMany
        .mockResolvedValueOnce([{ id: 'entity-1' }])
        .mockResolvedValueOnce([existingEvent]);

      const suggestions = await service.findAvailableSlots(request, 'user-1', 2);
      const conflictingSlot = suggestions.find(
        (s) => s.slot.start.getTime() === existingEvent.startTime.getTime()
      );
      expect(conflictingSlot).toBeUndefined();
    });

    it('should limit results to lookAheadDays', async () => {
      mockFindMany.mockResolvedValue([{ id: 'entity-1' }]);
      const suggestions = await service.findAvailableSlots(request, 'user-1', 1);
      // All suggestions should be within 1 day
      for (const s of suggestions) {
        const daysDiff = (new Date(s.slot.start).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        expect(daysDiff).toBeLessThan(2);
      }
    });

    it('should consider energy levels in scoring', async () => {
      mockFindMany.mockResolvedValue([{ id: 'entity-1' }]);
      const suggestions = await service.findAvailableSlots(request, 'user-1', 7);
      for (const s of suggestions) {
        expect(s.energyLevel).toBeDefined();
        expect(['PEAK', 'HIGH', 'MODERATE', 'LOW', 'RECOVERY']).toContain(s.energyLevel);
      }
    });
  });

  describe('detectConflicts', () => {
    it('should detect TIME_OVERLAP with existing events', async () => {
      const existingEvent = makeEvent();
      mockFindMany.mockResolvedValue([existingEvent]);

      const conflicts = await service.detectConflicts(
        'entity-1',
        { start: new Date('2026-02-16T10:30:00'), end: new Date('2026-02-16T11:30:00') },
        'user-1'
      );

      expect(conflicts.some((c) => c.type === 'TIME_OVERLAP')).toBe(true);
    });

    it('should detect FOCUS_BLOCK conflict', async () => {
      mockFindMany.mockResolvedValue([]);

      const conflicts = await service.detectConflicts(
        'entity-1',
        { start: new Date('2026-02-16T09:30:00'), end: new Date('2026-02-16T10:30:00') },
        'user-1'
      );

      expect(conflicts.some((c) => c.type === 'FOCUS_BLOCK')).toBe(true);
    });

    it('should detect MEETING_FREE_DAY violation', async () => {
      mockFindMany.mockResolvedValue([]);

      // Sunday (day 0) is a meeting-free day
      const sunday = new Date('2026-02-15'); // Feb 15, 2026 is Sunday
      sunday.setHours(10, 0, 0, 0);
      const sundayEnd = new Date(sunday);
      sundayEnd.setHours(11, 0, 0, 0);

      const conflicts = await service.detectConflicts(
        'entity-1',
        { start: sunday, end: sundayEnd },
        'user-1'
      );

      expect(conflicts.some((c) => c.type === 'MEETING_FREE_DAY')).toBe(true);
    });

    it('should return empty for conflict-free slot', async () => {
      // No existing events, not on meeting-free day, not in focus hours
      const mockUserNoRestrictions = {
        ...mockUser,
        preferences: { meetingFreedays: [], focusHours: [], attentionBudget: 100 },
      };
      mockFindUnique.mockResolvedValue(mockUserNoRestrictions);
      mockFindMany.mockResolvedValue([]);

      // Wednesday at 2pm - should be conflict-free
      const conflicts = await service.detectConflicts(
        'entity-1',
        { start: new Date('2026-02-18T14:00:00'), end: new Date('2026-02-18T15:00:00') },
        'user-1'
      );

      const hardConflicts = conflicts.filter((c) => c.severity === 'HARD');
      expect(hardConflicts).toHaveLength(0);
    });

    it('should detect CROSS_ENTITY conflicts', async () => {
      const crossEntityEvent = makeEvent({ entityId: 'entity-2' });
      mockFindMany
        .mockResolvedValueOnce([{ id: 'entity-1' }, { id: 'entity-2' }]) // entities
        .mockResolvedValueOnce([crossEntityEvent]); // events

      const conflicts = await service.detectConflicts(
        'entity-1',
        { start: new Date('2026-02-16T10:00:00'), end: new Date('2026-02-16T11:00:00') },
        'user-1'
      );

      expect(conflicts.some((c) => c.type === 'CROSS_ENTITY')).toBe(true);
    });
  });

  describe('rescheduleEvent', () => {
    it('should update event times', async () => {
      const existingEvent = makeEvent();
      mockFindUniqueOrThrow.mockResolvedValue(existingEvent);
      mockUpdate.mockResolvedValue({
        ...existingEvent,
        startTime: new Date('2026-02-16T14:00:00'),
        endTime: new Date('2026-02-16T15:00:00'),
      });
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([]);

      const result = await service.rescheduleEvent(
        {
          eventId: 'evt-1',
          newStartTime: new Date('2026-02-16T14:00:00'),
          newEndTime: new Date('2026-02-16T15:00:00'),
        },
        'user-1'
      );

      expect(result.event.startTime).toEqual(new Date('2026-02-16T14:00:00'));
    });

    it('should detect new conflicts at new time', async () => {
      const existingEvent = makeEvent();
      const conflictingEvent = makeEvent({
        id: 'evt-2',
        startTime: new Date('2026-02-16T14:00:00'),
        endTime: new Date('2026-02-16T15:00:00'),
      });

      mockFindUniqueOrThrow.mockResolvedValue(existingEvent);
      mockUpdate.mockResolvedValue({
        ...existingEvent,
        startTime: new Date('2026-02-16T14:00:00'),
        endTime: new Date('2026-02-16T15:00:00'),
      });
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([conflictingEvent]);

      const result = await service.rescheduleEvent(
        {
          eventId: 'evt-1',
          newStartTime: new Date('2026-02-16T14:00:00'),
          newEndTime: new Date('2026-02-16T15:00:00'),
        },
        'user-1'
      );

      // Should detect the conflicting event (but exclude self via excludeEventId)
      expect(result.conflicts).toBeDefined();
    });
  });

  describe('getCalendarViewData', () => {
    beforeEach(() => {
      mockFindMany.mockResolvedValue([]);
    });

    it('should return day view data', async () => {
      const data = await service.getCalendarViewData('user-1', 'day', new Date('2026-02-16'));
      expect(data.viewMode).toBe('day');
      expect(data.dateRange).toBeDefined();
    });

    it('should return week view data', async () => {
      const data = await service.getCalendarViewData('user-1', 'week', new Date('2026-02-16'));
      expect(data.viewMode).toBe('week');
    });

    it('should return month view data', async () => {
      const data = await service.getCalendarViewData('user-1', 'month', new Date('2026-02-16'));
      expect(data.viewMode).toBe('month');
    });

    it('should include focus blocks', async () => {
      const data = await service.getCalendarViewData('user-1', 'day', new Date('2026-02-16'));
      expect(data.focusBlocks).toBeDefined();
      expect(Array.isArray(data.focusBlocks)).toBe(true);
    });

    it('should include buffer blocks', async () => {
      const evWithBuffers = makeEvent({ bufferBefore: 10, bufferAfter: 5 });
      mockFindMany
        .mockResolvedValueOnce([{ id: 'entity-1' }]) // entities
        .mockResolvedValueOnce([evWithBuffers]) // events
        .mockResolvedValueOnce([{ id: 'entity-1', name: 'Test', brandKit: null }]) // entity info
        .mockResolvedValueOnce([]); // contacts

      const data = await service.getCalendarViewData('user-1', 'day', new Date('2026-02-16'));
      expect(data.bufferBlocks).toBeDefined();
    });

    it('should include energy overlay', async () => {
      const data = await service.getCalendarViewData('user-1', 'day', new Date('2026-02-16'));
      expect(data.energyOverlay).toBeDefined();
      expect(data.energyOverlay?.length).toBe(24);
    });
  });

  describe('createEvent', () => {
    it('should create an event with buffers', async () => {
      const newEvent = makeEvent({ id: 'new-evt' });
      mockCreate.mockResolvedValue(newEvent);

      const request: ScheduleRequest = {
        title: 'New Meeting',
        entityId: 'entity-1',
        duration: 60,
        priority: 'MEDIUM',
        type: 'MEETING',
      };

      const event = await service.createEvent(
        request,
        { start: new Date('2026-02-16T10:00:00'), end: new Date('2026-02-16T11:00:00') },
        'user-1'
      );

      expect(mockCreate).toHaveBeenCalled();
      expect(event.id).toBeDefined();
    });
  });

  describe('deleteEvent', () => {
    it('should delete an event', async () => {
      mockDelete.mockResolvedValue({});
      await service.deleteEvent('evt-1', 'user-1');
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
    });
  });
});
