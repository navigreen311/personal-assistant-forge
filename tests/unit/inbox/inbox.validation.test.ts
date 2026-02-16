import {
  triageMessageSchema,
  inboxListSchema,
  draftRequestSchema,
  createCannedResponseSchema,
  batchTriageSchema,
  createFollowUpSchema,
  sendDraftSchema,
} from '@/modules/inbox/inbox.validation';

describe('triageMessageSchema', () => {
  it('should accept valid triage input', () => {
    const result = triageMessageSchema.safeParse({
      messageId: 'msg-123',
      entityId: 'entity-456',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing messageId', () => {
    const result = triageMessageSchema.safeParse({
      entityId: 'entity-456',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing entityId', () => {
    const result = triageMessageSchema.safeParse({
      messageId: 'msg-123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty messageId', () => {
    const result = triageMessageSchema.safeParse({
      messageId: '',
      entityId: 'entity-456',
    });
    expect(result.success).toBe(false);
  });
});

describe('inboxListSchema', () => {
  it('should accept valid list params', () => {
    const result = inboxListSchema.safeParse({
      entityId: 'entity-1',
      channel: 'EMAIL',
      page: 1,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it('should apply defaults for page and pageSize', () => {
    const result = inboxListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortBy).toBe('triageScore');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should reject triageScore out of 1-10 range', () => {
    const result = inboxListSchema.safeParse({
      minTriageScore: 0,
    });
    expect(result.success).toBe(false);

    const result2 = inboxListSchema.safeParse({
      maxTriageScore: 11,
    });
    expect(result2.success).toBe(false);
  });

  it('should coerce string dates to Date objects', () => {
    const result = inboxListSchema.safeParse({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateFrom).toBeInstanceOf(Date);
      expect(result.data.dateTo).toBeInstanceOf(Date);
    }
  });

  it('should reject pageSize over 100', () => {
    const result = inboxListSchema.safeParse({
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });

  it('should coerce string numbers for page and pageSize', () => {
    const result = inboxListSchema.safeParse({
      page: '2',
      pageSize: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });
});

describe('draftRequestSchema', () => {
  it('should accept valid draft request', () => {
    const result = draftRequestSchema.safeParse({
      messageId: 'msg-1',
      entityId: 'entity-1',
      tone: 'FORMAL',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid tone values', () => {
    const result = draftRequestSchema.safeParse({
      messageId: 'msg-1',
      entityId: 'entity-1',
      tone: 'INVALID_TONE',
    });
    expect(result.success).toBe(false);
  });

  it('should accept request without optional fields', () => {
    const result = draftRequestSchema.safeParse({
      messageId: 'msg-1',
      entityId: 'entity-1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing messageId', () => {
    const result = draftRequestSchema.safeParse({
      entityId: 'entity-1',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid tones', () => {
    const tones = ['FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE'];
    for (const tone of tones) {
      const result = draftRequestSchema.safeParse({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('createCannedResponseSchema', () => {
  it('should accept valid canned response input', () => {
    const result = createCannedResponseSchema.safeParse({
      name: 'Test Response',
      entityId: 'entity-1',
      channel: 'EMAIL',
      category: 'Support',
      body: 'Thank you for reaching out.',
      tone: 'FORMAL',
    });
    expect(result.success).toBe(true);
  });

  it('should reject body over 5000 chars', () => {
    const result = createCannedResponseSchema.safeParse({
      name: 'Test',
      entityId: 'entity-1',
      channel: 'EMAIL',
      category: 'Support',
      body: 'x'.repeat(5001),
      tone: 'FORMAL',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid channel values', () => {
    const result = createCannedResponseSchema.safeParse({
      name: 'Test',
      entityId: 'entity-1',
      channel: 'PIGEON',
      category: 'Support',
      body: 'Hello',
      tone: 'FORMAL',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = createCannedResponseSchema.safeParse({
      name: '',
      entityId: 'entity-1',
      channel: 'EMAIL',
      category: 'Support',
      body: 'Hello',
      tone: 'FORMAL',
    });
    expect(result.success).toBe(false);
  });

  it('should accept with optional variables', () => {
    const result = createCannedResponseSchema.safeParse({
      name: 'Template',
      entityId: 'entity-1',
      channel: 'EMAIL',
      category: 'Sales',
      body: 'Dear {{contact_name}}, welcome to {{company}}.',
      variables: ['{{contact_name}}', '{{company}}'],
      tone: 'WARM',
    });
    expect(result.success).toBe(true);
  });
});

describe('batchTriageSchema', () => {
  it('should accept valid batch request', () => {
    const result = batchTriageSchema.safeParse({
      entityId: 'entity-1',
      messageIds: ['msg-1', 'msg-2'],
    });
    expect(result.success).toBe(true);
  });

  it('should apply default maxMessages of 50', () => {
    const result = batchTriageSchema.safeParse({
      entityId: 'entity-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxMessages).toBe(50);
    }
  });

  it('should reject maxMessages over 200', () => {
    const result = batchTriageSchema.safeParse({
      entityId: 'entity-1',
      maxMessages: 201,
    });
    expect(result.success).toBe(false);
  });
});

describe('createFollowUpSchema', () => {
  it('should accept valid follow-up input', () => {
    const result = createFollowUpSchema.safeParse({
      messageId: 'msg-1',
      entityId: 'entity-1',
      reminderAt: '2024-06-01T10:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reminderAt).toBeInstanceOf(Date);
    }
  });

  it('should reject missing reminderAt', () => {
    const result = createFollowUpSchema.safeParse({
      messageId: 'msg-1',
      entityId: 'entity-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('sendDraftSchema', () => {
  it('should accept valid send request', () => {
    const result = sendDraftSchema.safeParse({
      messageId: 'msg-1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty messageId', () => {
    const result = sendDraftSchema.safeParse({
      messageId: '',
    });
    expect(result.success).toBe(false);
  });
});
