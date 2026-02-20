/**
 * E2E Test: Calendar Management
 * Tests full calendar flows end-to-end:
 *   event CRUD, scheduling with conflict detection, availability checking,
 *   prep packet generation, natural language scheduling
 *
 * Services under test:
 * - SchedulingService (scheduling.service.ts)
 * - PrepPacketService (prep.service.ts)
 * - NLPSchedulingService (nlp.service.ts)
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
  v4: jest.fn(() => 'e2e-event-uuid'),
}));

import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { PrepPacketService } from '@/modules/calendar/prep.service';
import { NLPSchedulingService } from '@/modules/calendar/nlp.service';
import { generateJSON } from '@/lib/ai';

const mockedGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

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

describe('Calendar Management E2E Tests', () => {
  let schedulingService: SchedulingService;
  let prepService: PrepPacketService;
  let nlpService: NLPSchedulingService;

  beforeEach(() => {
    jest.clearAllMocks();
    schedulingService = new SchedulingService();
    prepService = new PrepPacketService();
    nlpService = new NLPSchedulingService();
    mockedGenerateJSON.mockRejectedValue(new Error('AI unavailable'));
  });

  // =========================================================================
  // Event CRUD
  // =========================================================================
  describe('Event CRUD', () => {
    it('should create an event and verify its properties', async () => {
      const eventRecord = createMockCalendarEvent({
        id: 'e2e-event-uuid',
        title: 'Team Standup',
        startTime: new Date('2026-02-20T09:00:00Z'),
        endTime: new Date('2026-02-20T09:30:00Z'),
      });

      mockPrisma.calendarEvent.create.mockResolvedValue(eventRecord);

      const event = await schedulingService.createEvent(
        {
          title: 'Team Standup',
          entityId: 'entity-1',
          duration: 30,
          priority: 'MEDIUM',
          type: 'MEETING',
        },
        {
          start: new Date('2026-02-20T09:00:00Z'),
          end: new Date('2026-02-20T09:30:00Z'),
        },
        'user-1'
      );

      expect(event.id).toBe('e2e-event-uuid');
      expect(event.title).toBe('Team Standup');
      expect(event.startTime).toEqual(new Date('2026-02-20T09:00:00Z'));
      expect(event.endTime).toEqual(new Date('2026-02-20T09:30:00Z'));
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Team Standup',
          entityId: 'entity-1',
        }),
      });
    });

    it('should update an event title', async () => {
      const updatedRecord = createMockCalendarEvent({
        id: 'update-event',
        title: 'Renamed Meeting',
      });

      mockPrisma.calendarEvent.update.mockResolvedValue(updatedRecord);

      const updated = await schedulingService.updateEvent(
        'update-event',
        { title: 'Renamed Meeting' },
        'user-1'
      );

      expect(updated.id).toBe('update-event');
      expect(updated.title).toBe('Renamed Meeting');
      expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
        where: { id: 'update-event' },
        data: expect.objectContaining({ title: 'Renamed Meeting' }),
      });
    });

    it('should reschedule an event to a new time', async () => {
      const originalEvent = createMockCalendarEvent({
        id: 'reschedule-event',
        title: 'Movable Meeting',
        entityId: 'entity-1',
        startTime: new Date('2026-02-18T10:00:00Z'),
        endTime: new Date('2026-02-18T11:00:00Z'),
      });

      mockPrisma.calendarEvent.create.mockResolvedValue(originalEvent);
      await schedulingService.createEvent(
        { title: 'Movable Meeting', entityId: 'entity-1', duration: 60, priority: 'MEDIUM', type: 'MEETING' },
        { start: new Date('2026-02-18T10:00:00Z'), end: new Date('2026-02-18T11:00:00Z') },
        'user-1'
      );

      const rescheduledRecord = {
        ...originalEvent,
        startTime: new Date('2026-02-19T14:00:00Z'),
        endTime: new Date('2026-02-19T15:00:00Z'),
      };

      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(originalEvent);
      mockPrisma.calendarEvent.update.mockResolvedValue(rescheduledRecord);
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([]);

      const result = await schedulingService.rescheduleEvent(
        {
          eventId: 'reschedule-event',
          newStartTime: new Date('2026-02-19T14:00:00Z'),
          newEndTime: new Date('2026-02-19T15:00:00Z'),
        },
        'user-1'
      );

      expect(result.event).toBeDefined();
      expect(result.conflicts).toBeInstanceOf(Array);
    });
  });

  // =========================================================================
  // Scheduling with conflict detection
  // =========================================================================
  describe('Scheduling with conflict detection', () => {
    it('should detect a time overlap conflict', async () => {
      const existingEvent = createMockCalendarEvent({
        id: 'blocker-event',
        title: 'Existing Call',
        startTime: new Date('2026-02-20T10:00:00Z'),
        endTime: new Date('2026-02-20T11:00:00Z'),
      });

      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([existingEvent]);

      const conflicts = await schedulingService.detectConflicts(
        'entity-1',
        { start: new Date('2026-02-20T10:30:00Z'), end: new Date('2026-02-20T11:30:00Z') },
        'user-1'
      );

      expect(conflicts.length).toBeGreaterThan(0);
      const overlap = conflicts.find((c) => c.type === 'TIME_OVERLAP');
      expect(overlap).toBeDefined();
      expect(overlap!.severity).toBe('HARD');
      expect(overlap!.description).toContain('Existing Call');
    });

    it('should return no hard conflicts when the time slot is free', async () => {
      const existingEvent = createMockCalendarEvent({
        id: 'morning-event',
        title: 'Morning Meeting',
        startTime: new Date('2026-02-20T09:00:00Z'),
        endTime: new Date('2026-02-20T10:00:00Z'),
        bufferBefore: 0,
        bufferAfter: 0,
      });

      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([existingEvent]);

      const conflicts = await schedulingService.detectConflicts(
        'entity-1',
        { start: new Date('2026-02-20T14:00:00Z'), end: new Date('2026-02-20T15:00:00Z') },
        'user-1'
      );

      const hardConflicts = conflicts.filter((c) => c.severity === 'HARD');
      expect(hardConflicts).toHaveLength(0);
    });

    it('should detect conflict during reschedule', async () => {
      const eventToMove = createMockCalendarEvent({
        id: 'move-event',
        title: 'Client Call',
        entityId: 'entity-1',
      });
      const conflictingEvent = createMockCalendarEvent({
        id: 'existing-conflict',
        title: 'Team Sync',
        startTime: new Date('2026-02-20T14:00:00Z'),
        endTime: new Date('2026-02-20T15:00:00Z'),
      });

      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(eventToMove);
      mockPrisma.calendarEvent.update.mockResolvedValue({
        ...eventToMove,
        startTime: new Date('2026-02-20T14:00:00Z'),
        endTime: new Date('2026-02-20T15:00:00Z'),
      });
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([conflictingEvent]);

      const result = await schedulingService.rescheduleEvent(
        {
          eventId: 'move-event',
          newStartTime: new Date('2026-02-20T14:00:00Z'),
          newEndTime: new Date('2026-02-20T15:00:00Z'),
        },
        'user-1'
      );

      expect(result.event).toBeDefined();
      expect(result.conflicts.some((c) => c.type === 'TIME_OVERLAP')).toBe(true);
    });
  });

  // =========================================================================
  // Availability checking
  // =========================================================================
  describe('Availability checking', () => {
    it('should find available slots when calendar is empty', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([]);

      const slots = await schedulingService.findAvailableSlots(
        { title: 'New Meeting', entityId: 'entity-1', duration: 60, priority: 'MEDIUM', type: 'MEETING' },
        'user-1',
        7
      );

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(10);

      for (let i = 1; i < slots.length; i++) {
        expect(slots[i - 1].score).toBeGreaterThanOrEqual(slots[i].score);
      }

      const firstSlot = slots[0];
      expect(firstSlot.slot.start).toBeInstanceOf(Date);
      expect(firstSlot.slot.end).toBeInstanceOf(Date);
      expect(firstSlot.score).toBeGreaterThan(0);
      expect(firstSlot.reasoning).toBeInstanceOf(Array);
    });

    it('should find slots that avoid existing meetings', async () => {
      const existingEvents = [
        createMockCalendarEvent({ id: 'am-event', startTime: new Date('2026-02-20T09:00:00Z'), endTime: new Date('2026-02-20T10:00:00Z') }),
        createMockCalendarEvent({ id: 'pm-event', startTime: new Date('2026-02-20T14:00:00Z'), endTime: new Date('2026-02-20T15:00:00Z') }),
      ];

      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue(existingEvents);

      const slots = await schedulingService.findAvailableSlots(
        { title: 'Available Slot Meeting', entityId: 'entity-1', duration: 60, priority: 'MEDIUM', type: 'MEETING' },
        'user-1',
        7
      );

      expect(slots.length).toBeGreaterThan(0);

      for (const suggestion of slots.slice(0, 3)) {
        const hardConflicts = suggestion.conflicts.filter((c) => c.severity === 'HARD');
        expect(hardConflicts).toHaveLength(0);
      }
    });
  });

  // =========================================================================
  // Prep packet generation
  // =========================================================================
  describe('Prep packet generation', () => {
    it('should generate a comprehensive prep packet for a meeting', async () => {
      const eventRecord = createMockCalendarEvent({
        id: 'prep-event',
        title: 'Investor Review',
        participantIds: ['contact-1', 'contact-2'],
      });

      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(eventRecord);
      mockPrisma.contact.findMany.mockResolvedValue([
        { name: 'Alice Chen', email: 'alice@venture.com', tags: ['VIP', 'Investor'], relationshipScore: 90 },
        { name: 'Bob Kumar', email: 'bob@venture.com', tags: [], relationshipScore: 70 },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([
        { subject: 'Due Diligence Questions', body: 'Please provide financials.', createdAt: new Date('2026-02-10'), channel: 'EMAIL' },
      ]);
      mockPrisma.task.findMany.mockResolvedValue([
        { title: 'Prepare financial summary', priority: 'P0', status: 'IN_PROGRESS', dueDate: new Date('2026-02-20') },
        { title: 'Update pitch deck', priority: 'P1', status: 'TODO', dueDate: new Date('2026-02-19') },
      ]);
      mockPrisma.calendarEvent.update.mockResolvedValue(eventRecord);

      const prepPacket = await prepService.generatePrepPacket({
        eventId: 'prep-event',
        entityId: 'entity-1',
        depth: 'STANDARD',
      });

      expect(prepPacket.eventId).toBe('prep-event');
      expect(prepPacket.generatedAt).toBeInstanceOf(Date);
      expect(prepPacket.attendeeProfiles).toHaveLength(2);
      expect(prepPacket.attendeeProfiles[0]).toContain('Alice Chen');
      expect(prepPacket.agenda).toBeInstanceOf(Array);
      expect(prepPacket.agenda.length).toBeGreaterThan(0);
      expect(prepPacket.agenda).toContain('Review: Investor Review');
      expect(prepPacket.talkingPoints.some((p) => p.includes('2 participant(s)'))).toBe(true);
      expect(prepPacket.openItems.length).toBe(2);
      expect(prepPacket.openItems.some((i) => i.includes('Prepare financial summary'))).toBe(true);

      expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
        where: { id: 'prep-event' },
        data: { prepPacket: expect.any(Object) },
      });
    });

    it('should handle a meeting with no attendees gracefully', async () => {
      const eventRecord = createMockCalendarEvent({ id: 'solo-event', title: 'Solo Focus Block', participantIds: [] });

      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(eventRecord);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.calendarEvent.update.mockResolvedValue(eventRecord);

      const prepPacket = await prepService.generatePrepPacket({
        eventId: 'solo-event',
        entityId: 'entity-1',
        depth: 'STANDARD',
      });

      expect(prepPacket.eventId).toBe('solo-event');
      expect(prepPacket.attendeeProfiles).toHaveLength(0);
      expect(prepPacket.openItems).toHaveLength(0);
    });
  });

  // =========================================================================
  // Natural language scheduling
  // =========================================================================
  describe('Natural language scheduling', () => {
    it('should parse "Schedule a call with Alice tomorrow at 2pm"', async () => {
      const parsed = await nlpService.parseScheduleRequest({
        text: 'Schedule a call with Alice tomorrow at 2pm',
        entityId: 'entity-1',
      });

      expect(parsed.title).toBeTruthy();
      expect(parsed.type).toBe('CALL');
      expect(parsed.participantNames).toContain('Alice');
      expect(parsed.timeHints.length).toBeGreaterThan(0);
      expect(parsed.confidence).toBeGreaterThan(0);
    });

    it('should parse "Quick meeting with Bob next Monday"', async () => {
      const parsed = await nlpService.parseScheduleRequest({
        text: 'Quick meeting with Bob next Monday',
        entityId: 'entity-1',
      });

      expect(parsed.type).toBe('MEETING');
      expect(parsed.duration).toBe(15);
      expect(parsed.participantNames).toContain('Bob');
      expect(parsed.timeHints.some((h) => h.value.includes('monday'))).toBe(true);
    });

    it('should parse "2 hour workshop with Dr. Smith next Friday"', async () => {
      const parsed = await nlpService.parseScheduleRequest({
        text: '2 hour workshop with Dr. Smith next Friday',
        entityId: 'entity-1',
      });

      expect(parsed.duration).toBe(120);
      expect(parsed.participantNames.length).toBeGreaterThanOrEqual(1);
      expect(parsed.timeHints.some((h) => h.value.includes('friday'))).toBe(true);
    });

    it('should infer event type from keywords', () => {
      expect(nlpService.inferEventType('schedule a call')).toBe('CALL');
      expect(nlpService.inferEventType('focus time block')).toBe('FOCUS_BLOCK');
      expect(nlpService.inferEventType('lunch break')).toBe('BREAK');
      expect(nlpService.inferEventType('team sync meeting')).toBe('MEETING');
      expect(nlpService.inferEventType('travel to office')).toBe('TRAVEL');
      expect(nlpService.inferEventType('debrief session')).toBe('DEBRIEF');
      expect(nlpService.inferEventType('prepare for meeting')).toBe('PREP');
      expect(nlpService.inferEventType('deadline for report')).toBe('DEADLINE');
      expect(nlpService.inferEventType('reminder to follow up')).toBe('REMINDER');
    });

    it('should infer priority from urgency keywords', () => {
      expect(nlpService.inferPriority('urgent meeting')).toBe('CRITICAL');
      expect(nlpService.inferPriority('important call')).toBe('HIGH');
      expect(nlpService.inferPriority('low priority sync')).toBe('LOW');
      expect(nlpService.inferPriority('regular meeting')).toBe('MEDIUM');
    });

    it('should infer duration from explicit and implicit cues', () => {
      expect(nlpService.inferDuration('30 minute call', 'CALL')).toBe(30);
      expect(nlpService.inferDuration('1 hour meeting', 'MEETING')).toBe(60);
      expect(nlpService.inferDuration('quick sync', 'CALL')).toBe(15);
      expect(nlpService.inferDuration('workshop session', 'MEETING')).toBe(120);
      expect(nlpService.inferDuration('lunch break', 'BREAK')).toBe(60);
      expect(nlpService.inferDuration('team meeting', 'MEETING')).toBe(60);
    });

    it('should resolve time hints relative to a reference date', () => {
      const refDate = new Date('2026-02-18T10:00:00Z');

      const tomorrowHints = nlpService.resolveTimeHints(
        [{ type: 'RELATIVE', value: 'tomorrow' }], refDate, 'UTC'
      );
      expect(tomorrowHints.length).toBe(1);
      expect(tomorrowHints[0].start.getDate()).toBe(19);

      const nextWeekHints = nlpService.resolveTimeHints(
        [{ type: 'RELATIVE', value: 'next week' }], refDate, 'UTC'
      );
      expect(nextWeekHints.length).toBe(1);
      expect(nextWeekHints[0].start.getDay()).toBe(1);

      const afternoonHints = nlpService.resolveTimeHints(
        [{ type: 'PREFERENCE', value: 'afternoon' }], refDate, 'UTC'
      );
      expect(afternoonHints.length).toBe(1);
      expect(afternoonHints[0].start.getHours()).toBeGreaterThanOrEqual(12);

      const absoluteHints = nlpService.resolveTimeHints(
        [{ type: 'ABSOLUTE', value: '3pm' }], refDate, 'UTC'
      );
      expect(absoluteHints.length).toBe(1);
      expect(absoluteHints[0].start.getHours()).toBe(15);
    });

    it('should resolve participant names to contact IDs', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-1', name: 'Alice Johnson' },
        { id: 'c-2', name: 'Bob Smith' },
      ]);

      const resolved = await nlpService.resolveParticipants(
        ['Alice', 'Bob', 'Charlie'], 'entity-1'
      );

      expect(resolved).toHaveLength(3);
      expect(resolved.find((r) => r.name === 'Alice')?.resolved).toBe(true);
      expect(resolved.find((r) => r.name === 'Bob')?.resolved).toBe(true);
      expect(resolved.find((r) => r.name === 'Charlie')?.resolved).toBe(false);
    });
  });

  // =========================================================================
  // Cross-module: NLP parse -> find slots -> create event -> prep packet
  // =========================================================================
  describe('Cross-module: NLP parse -> schedule -> prep packet', () => {
    it('should parse NLP input, find available slot, create event, and generate prep packet', async () => {
      // Step 1: Parse NLP input
      const parsed = await nlpService.parseScheduleRequest({
        text: 'Schedule a meeting with Alice tomorrow morning',
        entityId: 'entity-1',
      });
      expect(parsed.type).toBe('MEETING');
      expect(parsed.participantNames).toContain('Alice');

      // Step 2: Find available slots
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.entity.findMany.mockResolvedValue([{ id: 'entity-1' }]);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([]);

      const slots = await schedulingService.findAvailableSlots(
        { title: parsed.title, entityId: 'entity-1', duration: parsed.duration, priority: parsed.priority, type: parsed.type },
        'user-1', 7
      );
      expect(slots.length).toBeGreaterThan(0);

      // Step 3: Create event
      const eventRecord = createMockCalendarEvent({
        id: 'nlp-event',
        title: parsed.title,
        participantIds: ['contact-alice'],
        startTime: slots[0].slot.start,
        endTime: slots[0].slot.end,
      });
      mockPrisma.calendarEvent.create.mockResolvedValue(eventRecord);

      const event = await schedulingService.createEvent(
        { title: parsed.title, entityId: 'entity-1', duration: parsed.duration, priority: parsed.priority, type: parsed.type, participantIds: ['contact-alice'] },
        slots[0].slot, 'user-1'
      );
      expect(event.id).toBe('nlp-event');

      // Step 4: Generate prep packet
      mockPrisma.calendarEvent.findUniqueOrThrow.mockResolvedValue(eventRecord);
      mockPrisma.contact.findMany.mockResolvedValue([
        { name: 'Alice Johnson', email: 'alice@example.com', tags: [], relationshipScore: 75 },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.calendarEvent.update.mockResolvedValue(eventRecord);

      const prepPacket = await prepService.generatePrepPacket({
        eventId: 'nlp-event', entityId: 'entity-1', depth: 'STANDARD',
      });

      expect(prepPacket.eventId).toBe('nlp-event');
      expect(prepPacket.attendeeProfiles[0]).toContain('Alice Johnson');
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('Edge cases', () => {
    it('should handle creating an event with no participants', async () => {
      const eventRecord = createMockCalendarEvent({
        id: 'no-participant-event',
        title: 'Solo Deep Work',
        participantIds: [],
      });
      mockPrisma.calendarEvent.create.mockResolvedValue(eventRecord);

      const event = await schedulingService.createEvent(
        { title: 'Solo Deep Work', entityId: 'entity-1', duration: 120, priority: 'HIGH', type: 'FOCUS_BLOCK' },
        { start: new Date('2026-02-20T08:00:00Z'), end: new Date('2026-02-20T10:00:00Z') },
        'user-1'
      );

      expect(event.title).toBe('Solo Deep Work');
      expect(event.participantIds).toEqual([]);
    });

    it('should parse NLP input with no recognizable time hint', async () => {
      const parsed = await nlpService.parseScheduleRequest({
        text: 'meet with the team sometime',
        entityId: 'entity-1',
      });

      expect(parsed.title).toBeTruthy();
      expect(parsed.type).toBe('MEETING');
      expect(parsed.confidence).toBeGreaterThan(0);
    });

    it('should resolve time hints for "end of month"', () => {
      const refDate = new Date('2026-02-10T10:00:00Z');

      const hints = nlpService.resolveTimeHints(
        [{ type: 'RELATIVE', value: 'end of month' }], refDate, 'UTC'
      );

      expect(hints.length).toBe(1);
      expect(hints[0].start.getMonth()).toBe(1);
    });
  });
});
