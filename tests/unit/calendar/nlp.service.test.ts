import { NLPSchedulingService } from '../../../src/modules/calendar/nlp.service';

// Mock prisma to avoid DB calls in tests
jest.mock('../../../src/lib/db', () => ({
  prisma: {
    contact: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', name: 'Dr. Martinez' },
        { id: 'c2', name: 'Bobby Johnson' },
        { id: 'c3', name: 'Jennifer Smith' },
        { id: 'c4', name: 'Carlos Rivera' },
      ]),
    },
  },
}));

describe('NLPSchedulingService', () => {
  let service: NLPSchedulingService;

  beforeEach(() => {
    service = new NLPSchedulingService();
  });

  describe('parseScheduleRequest', () => {
    it('should parse "Set up a call with Dr. Martinez next week, prefer mornings"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'Set up a call with Dr. Martinez next week, prefer mornings',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('CALL');
      expect(result.participantNames).toContain('Dr. Martinez');
      expect(result.timeHints.some((h) => h.value === 'next week')).toBe(true);
      expect(result.timeHints.some((h) => h.value === 'morning')).toBe(true);
    });

    it('should parse "Schedule a 30-minute meeting with Bobby tomorrow at 2pm"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'Schedule a 30-minute meeting with Bobby tomorrow at 2pm',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('MEETING');
      expect(result.duration).toBe(30);
      expect(result.timeHints.some((h) => h.value === 'tomorrow')).toBe(true);
    });

    it('should parse "Block 2 hours for focus time on Friday morning"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'Block 2 hours for focus time on Friday morning',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('FOCUS_BLOCK');
      expect(result.duration).toBe(120);
    });

    it('should parse "Quick call with Jennifer this afternoon"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'Quick call with Jennifer this afternoon',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('CALL');
      expect(result.duration).toBe(15);
      expect(result.participantNames).toContain('Jennifer');
      expect(result.timeHints.some((h) => h.value === 'this afternoon')).toBe(true);
    });

    it('should parse "Workshop with the team next Wednesday, 2 hours"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'Workshop with the team next Wednesday, 2 hours',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('MEETING'); // workshop is still a meeting type
      expect(result.duration).toBe(120);
      expect(result.timeHints.some((h) => h.value === 'next wednesday')).toBe(true);
    });

    it('should parse "Lunch meeting with Carlos on Thursday"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'Lunch meeting with Carlos on Thursday',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('BREAK'); // "lunch" triggers BREAK
      expect(result.participantNames).toContain('Carlos');
    });

    it('should parse "URGENT: meeting with legal team today"', async () => {
      const result = await service.parseScheduleRequest({
        text: 'URGENT: meeting with legal team today',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.type).toBe('MEETING');
      expect(result.priority).toBe('CRITICAL');
      expect(result.timeHints.some((h) => h.value === 'today')).toBe(true);
    });

    it('should handle ambiguous input with lower confidence', async () => {
      const result = await service.parseScheduleRequest({
        text: 'something next week',
        entityId: 'e1',
        userId: 'u1',
      });
      expect(result.confidence).toBeLessThan(1);
      expect(result.type).toBe('MEETING'); // defaults to MEETING
    });
  });

  describe('resolveTimeHints', () => {
    const refDate = new Date('2026-02-15T10:00:00');

    it('should resolve "today" to current date', () => {
      const hints = [{ type: 'RELATIVE' as const, value: 'today' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getDate()).toBe(15);
    });

    it('should resolve "tomorrow" to next day', () => {
      const hints = [{ type: 'RELATIVE' as const, value: 'tomorrow' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getDate()).toBe(16);
    });

    it('should resolve "next week" to Mon-Fri of next week', () => {
      const hints = [{ type: 'RELATIVE' as const, value: 'next week' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getDay()).toBe(1); // Monday
    });

    it('should resolve "next tuesday" to coming Tuesday', () => {
      const hints = [{ type: 'RELATIVE' as const, value: 'next tuesday' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getDay()).toBe(2); // Tuesday
    });

    it('should resolve "in 3 days" to date + 3', () => {
      const hints = [{ type: 'RELATIVE' as const, value: 'in 3 days' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getDate()).toBe(18); // 15 + 3
    });

    it('should resolve "morning" to 08:00-12:00', () => {
      const hints = [{ type: 'PREFERENCE' as const, value: 'morning' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getHours()).toBe(8);
      expect(ranges[0].end.getHours()).toBe(12);
    });

    it('should resolve "afternoon" to 12:00-17:00', () => {
      const hints = [{ type: 'PREFERENCE' as const, value: 'afternoon' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getHours()).toBe(12);
      expect(ranges[0].end.getHours()).toBe(17);
    });

    it('should resolve "at 2pm" to specific time', () => {
      const hints = [{ type: 'ABSOLUTE' as const, value: '2pm' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getHours()).toBe(14);
    });

    it('should resolve "evening" to 17:00-20:00', () => {
      const hints = [{ type: 'PREFERENCE' as const, value: 'evening' }];
      const ranges = service.resolveTimeHints(hints, refDate, 'America/Chicago');
      expect(ranges).toHaveLength(1);
      expect(ranges[0].start.getHours()).toBe(17);
      expect(ranges[0].end.getHours()).toBe(20);
    });
  });

  describe('inferEventType', () => {
    it('should infer CALL for "call" or "phone"', () => {
      expect(service.inferEventType('quick call')).toBe('CALL');
      expect(service.inferEventType('phone meeting')).toBe('CALL');
    });

    it('should infer MEETING for "meeting" or "sync"', () => {
      expect(service.inferEventType('team meeting')).toBe('MEETING');
      expect(service.inferEventType('daily sync')).toBe('MEETING');
    });

    it('should infer FOCUS_BLOCK for "focus time" or "deep work"', () => {
      expect(service.inferEventType('focus time')).toBe('FOCUS_BLOCK');
      expect(service.inferEventType('deep work session')).toBe('FOCUS_BLOCK');
    });

    it('should infer BREAK for "lunch" or "walk"', () => {
      expect(service.inferEventType('lunch break')).toBe('BREAK');
      expect(service.inferEventType('afternoon walk')).toBe('BREAK');
    });

    it('should default to MEETING for ambiguous input', () => {
      expect(service.inferEventType('something with someone')).toBe('MEETING');
    });
  });

  describe('inferDuration', () => {
    it('should infer 15 min for "quick call"', () => {
      expect(service.inferDuration('quick call', 'CALL')).toBe(15);
    });

    it('should infer 30 min for "call"', () => {
      expect(service.inferDuration('call with bob', 'CALL')).toBe(30);
    });

    it('should infer 60 min for "meeting"', () => {
      expect(service.inferDuration('team meeting', 'MEETING')).toBe(60);
    });

    it('should infer 120 min for "workshop"', () => {
      expect(service.inferDuration('design workshop', 'MEETING')).toBe(120);
    });

    it('should parse explicit "30 min" or "1 hour"', () => {
      expect(service.inferDuration('30 min sync', 'MEETING')).toBe(30);
      expect(service.inferDuration('1 hour review', 'MEETING')).toBe(60);
      expect(service.inferDuration('2 hours brainstorm', 'MEETING')).toBe(120);
    });
  });

  describe('inferPriority', () => {
    it('should infer CRITICAL for "urgent"', () => {
      expect(service.inferPriority('urgent meeting')).toBe('CRITICAL');
    });

    it('should infer HIGH for "important"', () => {
      expect(service.inferPriority('important review')).toBe('HIGH');
    });

    it('should infer LOW for "no rush"', () => {
      expect(service.inferPriority('no rush, whenever')).toBe('LOW');
    });

    it('should default to MEDIUM', () => {
      expect(service.inferPriority('team sync')).toBe('MEDIUM');
    });
  });

  describe('resolveParticipants', () => {
    it('should resolve known contacts', async () => {
      const result = await service.resolveParticipants(['Dr. Martinez'], 'e1');
      expect(result).toHaveLength(1);
      expect(result[0].resolved).toBe(true);
      expect(result[0].contactId).toBe('c1');
    });

    it('should mark unknown contacts as unresolved', async () => {
      const result = await service.resolveParticipants(['Unknown Person'], 'e1');
      expect(result).toHaveLength(1);
      expect(result[0].resolved).toBe(false);
    });

    it('should return empty array for no names', async () => {
      const result = await service.resolveParticipants([], 'e1');
      expect(result).toHaveLength(0);
    });
  });
});
