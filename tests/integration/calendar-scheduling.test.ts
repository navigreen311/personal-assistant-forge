/**
 * Integration Test: Calendar Scheduling
 * Tests cross-module interactions: parse request -> check availability -> create event -> prep packet
 *
 * Services under test:
 * - scheduling.service.ts (SchedulingService: findAvailableSlots, createEvent, updateEvent, detectConflicts)
 * - prep.service.ts (PrepPacketService: generatePrepPacket)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  entity: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  calendarEvent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  contact: {
    findMany: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
  },
  task: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-event-uuid'),
}));

import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { PrepPacketService } from '@/modules/calendar/prep.service';

// --- Test helpers ---

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    chronotype: 'FLEXIBLE',
    preferences: {
      meetingFreedays: [],
      focusHours: [],
      attentionBudget: 20,
    },
    ...overrides,
  };
}

function createMockCalendarEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    title: 'Test Meeting',
    entityId: 'entity-1',
    participantIds: ['contact-1'],
    startTime: new Date('2026-02-18T10:00:00Z'),
    endTime: new Date('2026-02-18T11:00:00Z'),
    bufferBefore: 5,
    bufferAfter: 10,
    prepPacket: null,
    meetingNotes: null,
    recurrence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Calendar Scheduling Integration Tests', () => {
  let schedulingService: SchedulingService;
  let prepService: PrepPacketService;

  beforeEach(() => {
    jest.clearAllMocks();
    schedulingService = new SchedulingService();
    prepService = new PrepPacketService();
  });

  describe('Schedule from availability', () => {
    it('should find available slots and schedule an event in a free slot', async () => {
      const mockUser = createMockUser();

      // Mock user and entities lookup
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);

      // No existing events (all slots are free)
      mockPrisma.calendarEvent.findMany.mockResolvedValue([]);

      // Step 1: Find available slots
      const slots = await schedulingService.findAvailableSlots(
        {
          title: 'Team Sync',
          entityId: 'entity-1',
          duration: 60,
          priority: 'MEDIUM',
          type: 'MEETING',
        },
        'user-1',
        7
      );

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(10); // returns top 10

      // Slots should be sorted by score descending
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i - 1].score).toBeGreaterThanOrEqual(slots[i].score);
      }

      // Each slot should have required fields
      const firstSlot = slots[0];
      expect(firstSlot.slot.start).toBeInstanceOf(Date);
      expect(firstSlot.slot.end).toBeInstanceOf(Date);
      expect(firstSlot.score).toBeGreaterThan(0);
      expect(firstSlot.reasoning).toBeInstanceOf(Array);

      // Step 2: Create event in the first available slot
      const createdEventRecord = createMockCalendarEvent({
        id: 'test-event-uuid',
        title: 'Team Sync',
        startTime: firstSlot.slot.start,
        endTime: firstSlot.slot.end,
      });

      mockPrisma.calendarEvent.create.mockResolvedValue(createdEventRecord);

      const event = await schedulingService.createEvent(
        {
          title: 'Team Sync',
          entityId: 'entity-1',
          duration: 60,
          priority: 'MEDIUM',
          type: 'MEETING',
        },
        firstSlot.slot,
        'user-1'
      );

      expect(event.id).toBe('test-event-uuid');
      expect(event.title).toBe('Team Sync');
      expect(event.startTime).toEqual(firstSlot.slot.start);
      expect(event.endTime).toEqual(firstSlot.slot.end);

      // Verify the event was persisted
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Team Sync',
          entityId: 'entity-1',
          startTime: firstSlot.slot.start,
          endTime: firstSlot.slot.end,
        }),
      });
    });
  });

  describe('Prep packet generation', () => {
    it('should create an event and generate a prep packet with attendee context', async () => {
      const eventRecord = createMockCalendarEvent({
        id: 'event-prep',
        title: 'Client Review',
        participantIds: ['contact-1', 'contact-2'],
      });

      // Mock event lookup
      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(eventRecord);

      // Mock attendee profiles
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          name: 'Alice Johnson',
          email: 'alice@example.com',
          tags: ['VIP'],
          relationshipScore: 85,
        },
        {
          name: 'Bob Smith',
          email: 'bob@example.com',
          tags: [],
          relationshipScore: 60,
        },
      ]);

      // Mock recent interactions
      mockPrisma.message.findMany.mockResolvedValue([
        {
          subject: 'Project Update',
          body: 'Here is the latest update on the project deliverables and milestones.',
          createdAt: new Date('2026-02-10'),
          channel: 'EMAIL',
        },
      ]);

      // Mock open tasks
      mockPrisma.task.findMany.mockResolvedValue([
        {
          title: 'Review contract terms',
          priority: 'P0',
          status: 'IN_PROGRESS',
          dueDate: new Date('2026-02-20'),
        },
      ]);

      // Mock save
      mockPrisma.calendarEvent.update.mockResolvedValue(eventRecord);

      const prepPacket = await prepService.generatePrepPacket({
        eventId: 'event-prep',
        entityId: 'entity-1',
        depth: 'STANDARD',
      });

      expect(prepPacket.eventId).toBe('event-prep');
      expect(prepPacket.generatedAt).toBeInstanceOf(Date);
      expect(prepPacket.attendeeProfiles).toBeInstanceOf(Array);
      expect(prepPacket.attendeeProfiles.length).toBe(2);
      expect(prepPacket.attendeeProfiles[0]).toContain('Alice Johnson');

      // Agenda should include standard items
      expect(prepPacket.agenda).toBeInstanceOf(Array);
      expect(prepPacket.agenda.length).toBeGreaterThan(0);
      expect(prepPacket.agenda).toContain('Review: Client Review');

      // Talking points should reference participant count and open items
      expect(prepPacket.talkingPoints).toBeInstanceOf(Array);
      expect(prepPacket.talkingPoints.some((p) => p.includes('2 participant(s)'))).toBe(true);

      // Open items should be loaded
      expect(prepPacket.openItems.length).toBe(1);
      expect(prepPacket.openItems[0]).toContain('Review contract terms');

      // Prep packet should be saved to event
      expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-prep' },
        data: { prepPacket: expect.any(Object) },
      });
    });
  });

  describe('Conflict detection', () => {
    it('should detect time overlap when scheduling an event during an existing one', async () => {
      const existingEvent = createMockCalendarEvent({
        id: 'existing-1',
        title: 'Existing Meeting',
        startTime: new Date('2026-02-18T10:00:00Z'),
        endTime: new Date('2026-02-18T11:00:00Z'),
      });

      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);

      // Return existing event for conflict check
      mockPrisma.calendarEvent.findMany.mockResolvedValue([existingEvent]);

      const conflicts = await schedulingService.detectConflicts(
        'entity-1',
        {
          start: new Date('2026-02-18T10:30:00Z'),
          end: new Date('2026-02-18T11:30:00Z'),
        },
        'user-1'
      );

      expect(conflicts.length).toBeGreaterThan(0);

      const overlapConflict = conflicts.find((c) => c.type === 'TIME_OVERLAP');
      expect(overlapConflict).toBeDefined();
      expect(overlapConflict?.severity).toBe('HARD');
      expect(overlapConflict?.description).toContain('Existing Meeting');
    });

    it('should return no hard conflicts for a time slot with no overlaps', async () => {
      const existingEvent = createMockCalendarEvent({
        id: 'existing-1',
        title: 'Morning Meeting',
        startTime: new Date('2026-02-18T09:00:00Z'),
        endTime: new Date('2026-02-18T10:00:00Z'),
        bufferAfter: 0,
        bufferBefore: 0,
      });

      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([existingEvent]);

      const conflicts = await schedulingService.detectConflicts(
        'entity-1',
        {
          start: new Date('2026-02-18T14:00:00Z'),
          end: new Date('2026-02-18T15:00:00Z'),
        },
        'user-1'
      );

      const hardConflicts = conflicts.filter((c) => c.severity === 'HARD');
      expect(hardConflicts).toHaveLength(0);
    });
  });

  describe('Event update flow', () => {
    it('should create an event and update its time', async () => {
      const originalEvent = createMockCalendarEvent({
        id: 'event-update',
        title: 'Planning Session',
        startTime: new Date('2026-02-18T10:00:00Z'),
        endTime: new Date('2026-02-18T11:00:00Z'),
      });

      // Create the event
      mockPrisma.calendarEvent.create.mockResolvedValue(originalEvent);

      const event = await schedulingService.createEvent(
        {
          title: 'Planning Session',
          entityId: 'entity-1',
          duration: 60,
          priority: 'HIGH',
          type: 'MEETING',
        },
        {
          start: new Date('2026-02-18T10:00:00Z'),
          end: new Date('2026-02-18T11:00:00Z'),
        },
        'user-1'
      );

      expect(event.title).toBe('Planning Session');

      // Update the event time
      const updatedRecord = createMockCalendarEvent({
        id: 'event-update',
        title: 'Planning Session - Updated',
        startTime: new Date('2026-02-18T14:00:00Z'),
        endTime: new Date('2026-02-18T15:00:00Z'),
      });

      mockPrisma.calendarEvent.update.mockResolvedValue(updatedRecord);

      const updated = await schedulingService.updateEvent(
        'event-update',
        { title: 'Planning Session - Updated' },
        'user-1'
      );

      expect(updated.id).toBe('event-update');
      expect(updated.title).toBe('Planning Session - Updated');

      // Verify update was called
      expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-update' },
        data: expect.objectContaining({ title: 'Planning Session - Updated' }),
      });
    });

    it('should reschedule event and detect conflicts at new time', async () => {
      const existingEvent = createMockCalendarEvent({
        id: 'event-to-move',
        title: 'Movable Meeting',
        entityId: 'entity-1',
        startTime: new Date('2026-02-18T10:00:00Z'),
        endTime: new Date('2026-02-18T11:00:00Z'),
      });

      const conflictingEvent = createMockCalendarEvent({
        id: 'existing-conflict',
        title: 'Already Booked',
        startTime: new Date('2026-02-18T14:00:00Z'),
        endTime: new Date('2026-02-18T15:00:00Z'),
      });

      // Mock for findUniqueOrThrow (rescheduleEvent)
      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(existingEvent);
      mockPrisma.calendarEvent.update.mockResolvedValue({
        ...existingEvent,
        startTime: new Date('2026-02-18T14:00:00Z'),
        endTime: new Date('2026-02-18T15:00:00Z'),
      });

      // Mock for detectConflicts
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([conflictingEvent]);

      const result = await schedulingService.rescheduleEvent(
        {
          eventId: 'event-to-move',
          newStartTime: new Date('2026-02-18T14:00:00Z'),
          newEndTime: new Date('2026-02-18T15:00:00Z'),
        },
        'user-1'
      );

      expect(result.event).toBeDefined();
      expect(result.conflicts).toBeInstanceOf(Array);
      // Should detect the conflicting event
      expect(result.conflicts.some((c) => c.type === 'TIME_OVERLAP')).toBe(true);
    });
  });
});
