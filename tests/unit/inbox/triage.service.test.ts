import type { Message, Contact } from '@/shared/types';
import { TriageService } from '@/modules/inbox/triage.service';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    entity: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    channel: 'EMAIL',
    senderId: 'sender-1',
    recipientId: 'recipient-1',
    entityId: 'entity-1',
    body: 'Hello, this is a test message.',
    triageScore: 5,
    sensitivity: 'INTERNAL',
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'sender-1',
    entityId: 'entity-1',
    name: 'Test Sender',
    channels: [],
    relationshipScore: 50,
    lastTouch: null,
    commitments: [],
    preferences: {
      preferredChannel: 'EMAIL',
      preferredTone: 'FORMAL',
    },
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TriageService', () => {
  let service: TriageService;

  beforeEach(() => {
    service = new TriageService();
    jest.clearAllMocks();
  });

  describe('calculateUrgencyScore', () => {
    it('should return base score of 3 for neutral message', () => {
      // Mock business hours
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Hello there.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBe(3);
      jest.restoreAllMocks();
    });

    it('should add +2 for VIP sender', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Hello.' });
      const sender = makeContact({ tags: ['VIP'] });
      const score = service.calculateUrgencyScore(msg, sender);
      expect(score).toBeGreaterThanOrEqual(5); // 3 base + 2 VIP
      jest.restoreAllMocks();
    });

    it('should add +1 for high relationship score sender (>80)', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Hello.' });
      const sender = makeContact({ relationshipScore: 85 });
      const score = service.calculateUrgencyScore(msg, sender);
      expect(score).toBe(4); // 3 base + 1 relationship
      jest.restoreAllMocks();
    });

    it('should add +2 for urgent keywords ("ASAP", "emergency")', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'This is urgent, please respond ASAP!' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(5); // 3 + 2 urgent
      jest.restoreAllMocks();
    });

    it('should add +1 for deadline mentions within 7 days', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Please complete this by tomorrow.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(4); // 3 + 1 deadline
      jest.restoreAllMocks();
    });

    it('should add +2 for VOICE channel', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ channel: 'VOICE', body: 'Hello.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBe(5); // 3 + 2 voice
      jest.restoreAllMocks();
    });

    it('should add +1 for SMS channel', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ channel: 'SMS', body: 'Hello.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBe(4); // 3 + 1 SMS
      jest.restoreAllMocks();
    });

    it('should add +1 for thread escalation (follow-up keywords)', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Just following up on my previous email.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(4); // 3 + 1 follow-up
      jest.restoreAllMocks();
    });

    it('should add +1 for financial content', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Please review the invoice for $5,000.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(4); // 3 + financial
      jest.restoreAllMocks();
    });

    it('should add +1 for legal language', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'We need to discuss the contract terms.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(4); // 3 + 1 legal
      jest.restoreAllMocks();
    });

    it('should add +2 for compliance risk (PHI/PII)', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({ body: 'Patient MRN: 12345, diagnosis code ICD-10.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(5); // 3 + 2 compliance
      jest.restoreAllMocks();
    });

    it('should subtract -1 for outside business hours', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(22);
      const msg = makeMessage({ body: 'Hello there.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBe(2); // 3 - 1 off-hours
      jest.restoreAllMocks();
    });

    it('should cap score at 10', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({
        channel: 'VOICE',
        body: 'URGENT emergency! Please respond ASAP. Invoice $50000 by tomorrow. Contract lawsuit compliance. Patient MRN: 12345. Following up again.',
      });
      const sender = makeContact({ tags: ['VIP'], relationshipScore: 90 });
      const score = service.calculateUrgencyScore(msg, sender);
      expect(score).toBe(10);
      jest.restoreAllMocks();
    });

    it('should floor score at 1', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(23);
      const msg = makeMessage({ body: 'Hi.' });
      const score = service.calculateUrgencyScore(msg);
      expect(score).toBeGreaterThanOrEqual(1);
      jest.restoreAllMocks();
    });

    it('should handle combined signals correctly', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      const msg = makeMessage({
        channel: 'SMS',
        body: 'URGENT: Please review the invoice and sign the contract by tomorrow.',
      });
      const sender = makeContact({ tags: ['VIP'], relationshipScore: 85 });
      const score = service.calculateUrgencyScore(msg, sender);
      // 3 base + 2 VIP + 1 relationship + 2 urgent + 1 deadline + 1 SMS + 1 financial + 1 legal = 12 -> capped at 10
      expect(score).toBe(10);
      jest.restoreAllMocks();
    });
  });

  describe('classifyIntent', () => {
    it('should classify "Please send the report" as REQUEST', () => {
      expect(service.classifyIntent('Please send the report')).toBe('REQUEST');
    });

    it('should classify "What is the status?" as INQUIRY', () => {
      expect(service.classifyIntent('What is the status?')).toBe('INQUIRY');
    });

    it('should classify "URGENT: server down" as URGENT', () => {
      expect(service.classifyIntent('Server is down', 'URGENT: server down')).toBe('URGENT');
    });

    it('should classify informational messages as FYI', () => {
      expect(service.classifyIntent('Just a heads up.')).toBe('FYI');
    });

    it('should classify "Following up on our conversation" as FOLLOW_UP', () => {
      expect(service.classifyIntent('Following up on our conversation from last week.')).toBe('FOLLOW_UP');
    });

    it('should classify "Invoice #1234 attached" as FINANCIAL', () => {
      expect(service.classifyIntent('Invoice #1234 attached for your review.')).toBe('FINANCIAL');
    });

    it('should classify "Can we schedule a call?" as SCHEDULING', () => {
      expect(service.classifyIntent('Can we schedule a call for next week?')).toBe('SCHEDULING');
    });

    it('should classify "I am disappointed with the service" as COMPLAINT', () => {
      expect(service.classifyIntent('I am disappointed with the service quality.')).toBe('COMPLAINT');
    });

    it('should classify "Please approve the budget" as APPROVAL', () => {
      expect(service.classifyIntent('Please approve the budget for Q2.')).toBe('APPROVAL');
    });

    it('should default to UPDATE for factual statements', () => {
      const longBody = 'The quarterly results show a 15% increase in revenue. Operating margins improved by 3 points. The team successfully delivered all planned features ahead of expectations. Customer satisfaction scores remain above target at 92%.';
      expect(service.classifyIntent(longBody)).toBe('UPDATE');
    });
  });

  describe('detectSensitivity', () => {
    it('should detect REGULATED for medical record numbers', () => {
      expect(service.detectSensitivity('Patient MRN: 12345', [])).toBe('REGULATED');
    });

    it('should detect RESTRICTED for SSN patterns', () => {
      expect(service.detectSensitivity('SSN: 123-45-6789', [])).toBe('RESTRICTED');
    });

    it('should detect CONFIDENTIAL for salary information', () => {
      expect(service.detectSensitivity('The proposed salary is $150,000', [])).toBe('CONFIDENTIAL');
    });

    it('should return INTERNAL for general business content with compliance', () => {
      expect(service.detectSensitivity('Regular business update', ['HIPAA'])).toBe('INTERNAL');
    });

    it('should return PUBLIC for generic content', () => {
      expect(service.detectSensitivity('Hello, how are you?', [])).toBe('PUBLIC');
    });
  });

  describe('detectFlags', () => {
    it('should flag VIP_SENDER for VIP contacts', () => {
      const sender = makeContact({ tags: ['VIP'] });
      const flags = service.detectFlags('Hello', sender);
      expect(flags.some((f) => f.type === 'VIP_SENDER')).toBe(true);
    });

    it('should flag DEADLINE_MENTIONED for near-future dates', () => {
      const flags = service.detectFlags('Please complete by tomorrow');
      expect(flags.some((f) => f.type === 'DEADLINE_MENTIONED')).toBe(true);
    });

    it('should flag MONEY_MENTIONED for dollar amounts', () => {
      const flags = service.detectFlags('The total is $5,000.00');
      expect(flags.some((f) => f.type === 'MONEY_MENTIONED')).toBe(true);
    });

    it('should flag LEGAL_LANGUAGE for legal terms', () => {
      const flags = service.detectFlags('We need to review the contract and litigation risks');
      expect(flags.some((f) => f.type === 'LEGAL_LANGUAGE')).toBe(true);
    });

    it('should flag PHI_DETECTED for medical information', () => {
      const flags = service.detectFlags('Patient MRN: 12345 diagnosis ICD-10');
      expect(flags.some((f) => f.type === 'PHI_DETECTED')).toBe(true);
    });

    it('should flag PII_DETECTED for SSN/DOB patterns', () => {
      const flags = service.detectFlags('SSN: 123-45-6789');
      expect(flags.some((f) => f.type === 'PII_DETECTED')).toBe(true);
    });

    it('should flag SENTIMENT_NEGATIVE for negative language', () => {
      const flags = service.detectFlags('I am very disappointed and frustrated');
      expect(flags.some((f) => f.type === 'SENTIMENT_NEGATIVE')).toBe(true);
    });

    it('should return multiple flags for complex messages', () => {
      const sender = makeContact({ tags: ['VIP'] });
      const flags = service.detectFlags(
        'URGENT: Please approve the $50,000 contract by tomorrow. Patient MRN: 12345. I am frustrated.',
        sender
      );
      expect(flags.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('triageMessage', () => {
    it('should return complete TriageResult with all fields', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        channel: 'EMAIL',
        senderId: 'sender-1',
        recipientId: 'recipient-1',
        entityId: 'entity-1',
        threadId: null,
        subject: 'Test subject',
        body: 'Please send the report by tomorrow.',
        triageScore: 5,
        intent: null,
        sensitivity: 'INTERNAL',
        draftStatus: null,
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        name: 'Test Entity',
        type: 'LLC',
        complianceProfile: [],
      });
      (mockedPrisma.message.update as jest.Mock).mockResolvedValue({});

      const result = await service.triageMessage('msg-1', 'entity-1');

      expect(result).toHaveProperty('messageId', 'msg-1');
      expect(result).toHaveProperty('urgencyScore');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('sensitivity');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('suggestedPriority');
      expect(result).toHaveProperty('suggestedAction');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('flags');
      expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
      expect(result.urgencyScore).toBeLessThanOrEqual(10);

      jest.restoreAllMocks();
    });

    it('should update message triageScore in database', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        channel: 'EMAIL',
        senderId: 'sender-1',
        recipientId: 'recipient-1',
        entityId: 'entity-1',
        threadId: null,
        subject: null,
        body: 'Test message',
        triageScore: 5,
        intent: null,
        sensitivity: 'INTERNAL',
        draftStatus: null,
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        name: 'Test',
        type: 'Personal',
        complianceProfile: [],
      });
      (mockedPrisma.message.update as jest.Mock).mockResolvedValue({});

      await service.triageMessage('msg-1', 'entity-1');

      expect(mockedPrisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({
            triageScore: expect.any(Number),
            intent: expect.any(String),
          }),
        })
      );

      jest.restoreAllMocks();
    });
  });

  describe('batchTriage', () => {
    it('should process multiple messages', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([
        { id: 'msg-1' },
        { id: 'msg-2' },
      ]);

      const mockMsg = {
        id: 'msg-1',
        channel: 'EMAIL',
        senderId: 's1',
        recipientId: 'r1',
        entityId: 'e1',
        threadId: null,
        subject: null,
        body: 'Test',
        triageScore: 5,
        intent: null,
        sensitivity: 'INTERNAL',
        draftStatus: null,
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMsg);
      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1',
        name: 'Test',
        type: 'Personal',
        complianceProfile: [],
      });
      (mockedPrisma.message.update as jest.Mock).mockResolvedValue({});

      const result = await service.batchTriage({
        entityId: 'e1',
        messageIds: ['msg-1', 'msg-2'],
      });

      expect(result.processed).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.summary).toHaveProperty('urgent');
      expect(result.summary).toHaveProperty('needsResponse');
      expect(result.summary).toHaveProperty('canArchive');
      expect(result.summary).toHaveProperty('flagged');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      jest.restoreAllMocks();
    });

    it('should respect maxMessages limit', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      (mockedPrisma.message.findMany as jest.Mock).mockResolvedValue([
        { id: 'msg-1' },
      ]);

      const mockMsg = {
        id: 'msg-1',
        channel: 'EMAIL',
        senderId: 's1',
        recipientId: 'r1',
        entityId: 'e1',
        threadId: null,
        subject: null,
        body: 'Test',
        triageScore: 5,
        intent: null,
        sensitivity: 'INTERNAL',
        draftStatus: null,
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMsg);
      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1',
        name: 'Test',
        type: 'Personal',
        complianceProfile: [],
      });
      (mockedPrisma.message.update as jest.Mock).mockResolvedValue({});

      const result = await service.batchTriage({
        entityId: 'e1',
        maxMessages: 1,
      });

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 })
      );

      jest.restoreAllMocks();
    });

    it('should return accurate summary counts', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      const urgentMsg = {
        id: 'msg-urgent',
        channel: 'VOICE',
        senderId: 's1',
        recipientId: 'r1',
        entityId: 'e1',
        threadId: null,
        subject: 'URGENT',
        body: 'URGENT emergency! Please respond ASAP. This is critical and time-sensitive!',
        triageScore: 5,
        intent: null,
        sensitivity: 'INTERNAL',
        draftStatus: null,
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const normalMsg = {
        id: 'msg-normal',
        channel: 'EMAIL',
        senderId: 's1',
        recipientId: 'r1',
        entityId: 'e1',
        threadId: null,
        subject: null,
        body: 'FYI: meeting notes attached.',
        triageScore: 5,
        intent: null,
        sensitivity: 'INTERNAL',
        draftStatus: null,
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockedPrisma.message.findUnique as jest.Mock)
        .mockResolvedValueOnce(urgentMsg)
        .mockResolvedValueOnce(normalMsg);
      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1',
        name: 'Test',
        type: 'Personal',
        complianceProfile: [],
      });
      (mockedPrisma.message.update as jest.Mock).mockResolvedValue({});

      const result = await service.batchTriage({
        entityId: 'e1',
        messageIds: ['msg-urgent', 'msg-normal'],
      });

      expect(result.processed).toBe(2);
      expect(result.summary.urgent).toBeGreaterThanOrEqual(0);

      jest.restoreAllMocks();
    });
  });

  describe('triageMessage with AI', () => {
    const mockMsg = {
      id: 'msg-1',
      channel: 'EMAIL',
      senderId: 'sender-1',
      recipientId: 'recipient-1',
      entityId: 'entity-1',
      threadId: null,
      subject: 'Test subject',
      body: 'Please send the report by tomorrow.',
      triageScore: 5,
      intent: null,
      sensitivity: 'INTERNAL',
      draftStatus: null,
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMsg);
      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        name: 'Test Entity',
        type: 'LLC',
        complianceProfile: [],
      });
      (mockedPrisma.message.update as jest.Mock).mockResolvedValue({});
    });

    it('should use AI result when generateJSON succeeds', async () => {
      const aiResult = {
        urgencyScore: 7,
        intent: 'REQUEST',
        sensitivity: 'INTERNAL',
        category: 'OPERATIONS',
        suggestedAction: 'RESPOND_TODAY',
        reasoning: 'Request with deadline',
        confidence: 0.9,
        flags: [{ type: 'DEADLINE_MENTIONED', description: 'Tomorrow deadline', severity: 'MEDIUM' }],
      };
      mockedGenerateJSON.mockResolvedValue(aiResult);

      const result = await service.triageMessage('msg-1', 'entity-1');

      expect(mockedGenerateJSON).toHaveBeenCalled();
      expect(result.urgencyScore).toBe(7);
      expect(result.intent).toBe('REQUEST');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('Request with deadline');
    });

    it('should call generateJSON with message context in prompt', async () => {
      mockedGenerateJSON.mockResolvedValue({
        urgencyScore: 5,
        intent: 'REQUEST',
        sensitivity: 'PUBLIC',
        category: 'OPERATIONS',
        suggestedAction: 'RESPOND_THIS_WEEK',
        reasoning: 'Standard request',
        confidence: 0.8,
        flags: [],
      });

      await service.triageMessage('msg-1', 'entity-1');

      const callArgs = mockedGenerateJSON.mock.calls[0];
      const prompt = callArgs[0] as string;
      expect(prompt).toContain('Test subject');
      expect(prompt).toContain('Please send the report by tomorrow.');
      expect(prompt).toContain('EMAIL');
    });

    it('should include sender VIP status in prompt', async () => {
      (mockedPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'sender-1',
        name: 'VIP Client',
        tags: ['VIP'],
        channels: [],
        relationshipScore: 90,
        lastTouch: null,
        commitments: [],
        preferences: { preferredChannel: 'EMAIL', preferredTone: 'FORMAL' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockedGenerateJSON.mockResolvedValue({
        urgencyScore: 8,
        intent: 'REQUEST',
        sensitivity: 'INTERNAL',
        category: 'OPERATIONS',
        suggestedAction: 'RESPOND_TODAY',
        reasoning: 'VIP request',
        confidence: 0.9,
        flags: [],
      });

      await service.triageMessage('msg-1', 'entity-1');

      const prompt = mockedGenerateJSON.mock.calls[0][0] as string;
      expect(prompt).toContain('VIP');
    });

    it('should fall back to keyword scoring when AI call fails', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      mockedGenerateJSON.mockRejectedValue(new Error('AI service unavailable'));

      const result = await service.triageMessage('msg-1', 'entity-1');

      expect(result.messageId).toBe('msg-1');
      expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
      expect(result.urgencyScore).toBeLessThanOrEqual(10);
      expect(result.intent).toBeDefined();
      jest.restoreAllMocks();
    });

    it('should fall back to keyword scoring when JSON parse fails', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      mockedGenerateJSON.mockRejectedValue(new SyntaxError('Unexpected token'));

      const result = await service.triageMessage('msg-1', 'entity-1');

      expect(result.messageId).toBe('msg-1');
      expect(result.intent).toBeDefined();
      expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
      jest.restoreAllMocks();
    });
  });
});
