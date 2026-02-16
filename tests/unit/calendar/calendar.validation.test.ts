import {
  scheduleRequestSchema,
  naturalLanguageSchema,
  postMeetingSchema,
  calendarViewSchema,
  dragDropSchema,
  prepPacketSchema,
  analyticsSchema,
  conflictCheckSchema,
} from '../../../src/modules/calendar/calendar.validation';

describe('scheduleRequestSchema', () => {
  const validRequest = {
    title: 'Team Meeting',
    entityId: 'entity-1',
    duration: 60,
    priority: 'MEDIUM' as const,
    type: 'MEETING' as const,
  };

  it('should accept valid schedule request', () => {
    const result = scheduleRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject missing title', () => {
    const result = scheduleRequestSchema.safeParse({ ...validRequest, title: '' });
    expect(result.success).toBe(false);
  });

  it('should reject duration > 480 minutes', () => {
    const result = scheduleRequestSchema.safeParse({ ...validRequest, duration: 500 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid priority', () => {
    const result = scheduleRequestSchema.safeParse({ ...validRequest, priority: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid event type', () => {
    const result = scheduleRequestSchema.safeParse({ ...validRequest, type: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('should accept without optional fields', () => {
    const result = scheduleRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should accept with all optional fields', () => {
    const result = scheduleRequestSchema.safeParse({
      ...validRequest,
      participantIds: ['c1', 'c2'],
      bufferBefore: 10,
      bufferAfter: 5,
      location: 'Room A',
      notes: 'Important meeting',
      recurrence: 'FREQ=WEEKLY',
      requiresPrep: true,
      prepTimeMinutes: 15,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative duration', () => {
    const result = scheduleRequestSchema.safeParse({ ...validRequest, duration: -10 });
    expect(result.success).toBe(false);
  });

  it('should reject buffer > 120', () => {
    const result = scheduleRequestSchema.safeParse({ ...validRequest, bufferBefore: 150 });
    expect(result.success).toBe(false);
  });
});

describe('naturalLanguageSchema', () => {
  it('should accept valid text input', () => {
    const result = naturalLanguageSchema.safeParse({
      text: 'Schedule a meeting tomorrow',
      entityId: 'e1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject text shorter than 3 chars', () => {
    const result = naturalLanguageSchema.safeParse({
      text: 'Hi',
      entityId: 'e1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject text longer than 500 chars', () => {
    const result = naturalLanguageSchema.safeParse({
      text: 'a'.repeat(501),
      entityId: 'e1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing entityId', () => {
    const result = naturalLanguageSchema.safeParse({
      text: 'Schedule a meeting',
    });
    expect(result.success).toBe(false);
  });
});

describe('postMeetingSchema', () => {
  const validCapture = {
    eventId: 'evt-1',
    entityId: 'e1',
    notes: 'Great meeting',
    actionItems: [],
    sentiment: 'POSITIVE' as const,
  };

  it('should accept valid post-meeting capture', () => {
    const result = postMeetingSchema.safeParse(validCapture);
    expect(result.success).toBe(true);
  });

  it('should reject missing notes', () => {
    const result = postMeetingSchema.safeParse({ ...validCapture, notes: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid sentiment', () => {
    const result = postMeetingSchema.safeParse({ ...validCapture, sentiment: 'HAPPY' });
    expect(result.success).toBe(false);
  });

  it('should accept empty action items array', () => {
    const result = postMeetingSchema.safeParse(validCapture);
    expect(result.success).toBe(true);
  });

  it('should validate action item priority values', () => {
    const result = postMeetingSchema.safeParse({
      ...validCapture,
      actionItems: [{ title: 'Do thing', priority: 'INVALID' }],
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid action items', () => {
    const result = postMeetingSchema.safeParse({
      ...validCapture,
      actionItems: [
        { title: 'Follow up', priority: 'P0' },
        { title: 'Send docs', priority: 'P1', assigneeId: 'user-1', dueDate: '2026-02-20' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept with all optional fields', () => {
    const result = postMeetingSchema.safeParse({
      ...validCapture,
      decisions: ['Approved budget', 'Hired contractor'],
      keyTakeaways: ['Need more data'],
      followUpDate: '2026-02-20',
    });
    expect(result.success).toBe(true);
  });
});

describe('calendarViewSchema', () => {
  it('should accept valid view params', () => {
    const result = calendarViewSchema.safeParse({
      viewMode: 'week',
      date: '2026-02-15',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid viewMode', () => {
    const result = calendarViewSchema.safeParse({
      viewMode: 'year',
      date: '2026-02-15',
    });
    expect(result.success).toBe(false);
  });
});

describe('dragDropSchema', () => {
  it('should accept valid drag drop update', () => {
    const result = dragDropSchema.safeParse({
      eventId: 'evt-1',
      newStartTime: '2026-02-15T10:00:00',
      newEndTime: '2026-02-15T11:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing eventId', () => {
    const result = dragDropSchema.safeParse({
      eventId: '',
      newStartTime: '2026-02-15T10:00:00',
      newEndTime: '2026-02-15T11:00:00',
    });
    expect(result.success).toBe(false);
  });
});

describe('prepPacketSchema', () => {
  it('should accept valid prep packet request', () => {
    const result = prepPacketSchema.safeParse({
      eventId: 'evt-1',
      entityId: 'e1',
      depth: 'DETAILED',
    });
    expect(result.success).toBe(true);
  });

  it('should default depth to STANDARD', () => {
    const result = prepPacketSchema.safeParse({
      eventId: 'evt-1',
      entityId: 'e1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depth).toBe('STANDARD');
    }
  });
});

describe('analyticsSchema', () => {
  it('should accept valid date range', () => {
    const result = analyticsSchema.safeParse({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
    expect(result.success).toBe(true);
  });

  it('should accept with entityId', () => {
    const result = analyticsSchema.safeParse({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      entityId: 'e1',
    });
    expect(result.success).toBe(true);
  });
});

describe('conflictCheckSchema', () => {
  it('should accept valid conflict check', () => {
    const result = conflictCheckSchema.safeParse({
      entityId: 'e1',
      startTime: '2026-02-15T10:00:00',
      endTime: '2026-02-15T11:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('should accept with excludeEventId', () => {
    const result = conflictCheckSchema.safeParse({
      entityId: 'e1',
      startTime: '2026-02-15T10:00:00',
      endTime: '2026-02-15T11:00:00',
      excludeEventId: 'evt-1',
    });
    expect(result.success).toBe(true);
  });
});
