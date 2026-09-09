// Mock uuid before importing any modules that use it
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
}));

import { SchedulingService } from '../../../src/modules/calendar/scheduling.service';
import type { CalendarEvent } from '../../../src/shared/types';
import type { ScheduleRequest, TimeRange } from '../../../src/modules/calendar/calendar.types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

/**
 * P-05: the service now takes a `VerifiedEntityId` -- a branded string that
 * only `withEntityScope` can produce -- wherever it takes a tenant. A unit test
 * calling the service directly has no request, so it mints the brand through
 * the one sanctioned helper rather than scattering casts.
 */
const ENTITY_1 = verifiedEntityIdForTest('entity-1');

// Mock prisma
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();
const mockDelete = jest.fn();
const mockDeleteMany = jest.fn();
const mockFindUniqueOrThrow = jest.fn();
const mockFindFirst = jest.fn();
const mockEntityFindUnique = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    entity: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      // P-05: createEvent re-asserts the entity's owner against the caller as
      // defence in depth, so the entity delegate now needs its own findUnique.
      // It cannot share mockFindUnique with `user`, which answers a User row.
      findUnique: (...args: unknown[]) => mockEntityFindUnique(...args),
    },
    calendarEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      // P-05 trap 1: scoped reads are `findFirst({ where: { id, entityId } })`.
      // A mock without it returns undefined and the test fails somewhere else.
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      // `update`/`delete` take a unique WHERE and cannot carry the tenant, so
      // the scoped writes go through updateMany/deleteMany.
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
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
    // P-05 trap 2: an entity stub needs an owner, because createEvent now
    // compares entity.userId against the authenticated caller.
    mockEntityFindUnique.mockResolvedValue({ id: 'entity-1', userId: 'user-1' });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  describe('findAvailableSlots', () => {
    const request: ScheduleRequest = {
      title: 'New Meeting',
      entityId: ENTITY_1,
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
        ENTITY_1,
        { start: new Date('2026-02-16T10:30:00'), end: new Date('2026-02-16T11:30:00') },
        'user-1'
      );

      expect(conflicts.some((c) => c.type === 'TIME_OVERLAP')).toBe(true);
    });

    it('should detect FOCUS_BLOCK conflict', async () => {
      mockFindMany.mockResolvedValue([]);

      const conflicts = await service.detectConflicts(
        ENTITY_1,
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
        ENTITY_1,
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
        ENTITY_1,
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
        ENTITY_1,
        { start: new Date('2026-02-16T10:00:00'), end: new Date('2026-02-16T11:00:00') },
        'user-1'
      );

      expect(conflicts.some((c) => c.type === 'CROSS_ENTITY')).toBe(true);
    });
  });

  describe('rescheduleEvent', () => {
    it('should update event times', async () => {
      const existingEvent = makeEvent();
      mockFindFirst.mockResolvedValue({
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
        ENTITY_1,
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

      mockFindFirst.mockResolvedValue({
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
        ENTITY_1,
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
        entityId: ENTITY_1,
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
    // ---------------------------------------------------------------------
    // CORRECTED BY P-05.
    //
    // This assertion used to read:
    //
    //     await service.deleteEvent('evt-1', 'user-1');
    //     expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
    //
    // -- an event addressed by id with NO tenant in the WHERE clause, and the
    // second argument named `userId` but was ignored (`_userId`). It recorded
    // the defect as the requirement: any authenticated caller who knew an
    // event id could delete any tenant's meeting, and this test would have
    // gone green on that behaviour forever.
    //
    // `prisma.delete` takes a unique WHERE and cannot carry the tenant, so the
    // scoped delete is `deleteMany({ where: { id, entityId } })` and a
    // `count` of 0 is treated as not-found. See
    // docs/parallel-build/tenancy-pattern.md section 3.
    // ---------------------------------------------------------------------
    it('deletes an event only within the verified entity', async () => {
      mockDeleteMany.mockResolvedValue({ count: 1 });
      await service.deleteEvent('evt-1', ENTITY_1);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: 'evt-1', entityId: ENTITY_1 },
      });
    });

    it("refuses an event outside the verified entity, indistinguishably from one that does not exist", async () => {
      mockDeleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteEvent('evt-in-another-tenant', ENTITY_1)).rejects.toThrow(
        /Event not found/
      );
    });
  });
});
