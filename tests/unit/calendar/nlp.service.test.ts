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

// Mock AI client
jest.mock('../../../src/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { generateJSON } from '../../../src/lib/ai';

const mockGenerateJSON = generateJSON as jest.Mock;

describe('NLPSchedulingService', () => {
  let service: NLPSchedulingService;

  beforeEach(() => {
    service = new NLPSchedulingService();
    jest.clearAllMocks();
  });

  describe('parseScheduleRequest with AI', () => {
    it('should call generateJSON for natural language parsing', async () => {
      mockGenerateJSON.mockResolvedValue({
        title: 'Call with Dr. Martinez',
        eventType: 'CALL',
        startDate: '2026-02-20',
        startTime: '09:00',
        duration: 30,
        participants: ['Dr. Martinez'],
        location: null,
        priority: 'MEDIUM',
        recurrence: null,
        notes: null,
        confidence: 0.9,
      });

      const result = await service.parseScheduleRequest({
        text: 'Set up a call with Dr. Martinez next week',
        entityId: 'e1',
        userId: 'u1',
      });

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('CALL');
      expect(result.participantNames).toContain('Dr. Martinez');
      expect(result.confidence).toBe(0.9);
    });

    it('should extract date, time, duration, and participants from AI response', async () => {
      mockGenerateJSON.mockResolvedValue({
        title: 'Team Meeting',
        eventType: 'MEETING',
        startDate: '2026-02-16',
        startTime: '14:00',
        duration: 60,
        participants: ['Bobby Johnson', 'Jennifer Smith'],
        location: 'Conference Room A',
        priority: 'HIGH',
        recurrence: null,
        notes: 'Quarterly review',
        confidence: 0.85,
      });

      const result = await service.parseScheduleRequest({
        text: 'Schedule a meeting with Bobby and Jennifer tomorrow at 2pm in Conference Room A',
        entityId: 'e1',
        userId: 'u1',
      });

      expect(result.title).toBe('Team Meeting');
      expect(result.duration).toBe(60);
      expect(result.participantNames).toEqual(['Bobby Johnson', 'Jennifer Smith']);
      expect(result.location).toBe('Conference Room A');
      expect(result.priority).toBe('HIGH');
    });

    it('should fall back to regex parsing when AI fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));

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

    it('should fall back to regex parsing when AI confidence is below 0.5', async () => {
      mockGenerateJSON.mockResolvedValue({
        title: 'Something',
        eventType: 'MEETING',
        startDate: '2026-02-15',
        startTime: '10:00',
        duration: 30,
        participants: [],
        priority: 'MEDIUM',
        confidence: 0.3,
      });

      const result = await service.parseScheduleRequest({
        text: 'Quick call with Jennifer this afternoon',
        entityId: 'e1',
        userId: 'u1',
      });

      // Should fall back to regex parsing
      expect(result.type).toBe('CALL');
      expect(result.duration).toBe(15);
    });

    it('should handle ambiguous time references via AI', async () => {
      mockGenerateJSON.mockResolvedValue({
        title: 'Weekly Sync',
        eventType: 'MEETING',
        startDate: '2026-02-20',
        startTime: '10:00',
        duration: 30,
        participants: [],
        priority: 'MEDIUM',
        recurrence: 'WEEKLY',
        confidence: 0.8,
      });

      const result = await service.parseScheduleRequest({
        text: 'Set up a recurring weekly sync',
        entityId: 'e1',
        userId: 'u1',
      });

      expect(result.title).toBe('Weekly Sync');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should parse complex multi-person scheduling requests', async () => {
      mockGenerateJSON.mockResolvedValue({
        title: 'Project Kickoff Meeting',
        eventType: 'MEETING',
        startDate: '2026-02-18',
        startTime: '09:00',
        duration: 90,
        participants: ['Dr. Martinez', 'Bobby Johnson', 'Carlos Rivera'],
        location: 'Board Room',
        priority: 'HIGH',
        confidence: 0.92,
      });

      const result = await service.parseScheduleRequest({
        text: 'Schedule a 90 minute project kickoff with Dr. Martinez, Bobby, and Carlos next Wednesday at 9am in the Board Room',
        entityId: 'e1',
        userId: 'u1',
      });

      expect(result.participantNames).toHaveLength(3);
      expect(result.duration).toBe(90);
      expect(result.location).toBe('Board Room');
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
