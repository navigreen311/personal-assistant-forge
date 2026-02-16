/**
 * Integration Test: Inbox Flow
 * Tests cross-module interactions: receive message -> triage -> draft reply -> send
 *
 * Services under test:
 * - TriageService (triage.service.ts)
 * - DraftService (draft.service.ts)
 * - InboxService (inbox.service.ts)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  message: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  contact: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  entity: {
    findUnique: jest.fn(),
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
  v4: jest.fn(() => 'test-uuid-1234'),
}));

import { TriageService } from '@/modules/inbox/triage.service';
import { DraftService } from '@/modules/inbox/draft.service';
import { InboxService } from '@/modules/inbox/inbox.service';
import { generateJSON, generateText, chat } from '@/lib/ai';

const mockedGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;
const mockedGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockedChat = chat as jest.MockedFunction<typeof chat>;

// --- Test helpers ---

function createMockMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    channel: 'EMAIL',
    senderId: 'sender-1',
    recipientId: 'recipient-1',
    entityId: 'entity-1',
    threadId: null,
    subject: 'Test Subject',
    body: 'This is a test message body.',
    triageScore: 5,
    intent: null,
    sensitivity: 'PUBLIC',
    draftStatus: null,
    attachments: [],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function createMockEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity-1',
    userId: 'user-1',
    name: 'Test Entity',
    type: 'LLC',
    complianceProfile: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Inbox Flow Integration Tests', () => {
  let triageService: TriageService;
  let draftService: DraftService;
  let inboxService: InboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    triageService = new TriageService();
    draftService = new DraftService();
    inboxService = new InboxService();
  });

  describe('Full triage-to-draft flow', () => {
    it('should triage an incoming message and then generate a draft reply referencing the original', async () => {
      // Setup: mock message and entity in DB
      const mockMessage = createMockMessage({
        body: 'Could you please send the quarterly report? This is urgent and the deadline is tomorrow.',
        subject: 'Quarterly Report Request',
      });
      const mockEntity = createMockEntity();

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.contact.findUnique.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.message.update.mockResolvedValue(mockMessage);

      // AI mock for triage - simulate failure to test keyword fallback
      mockedGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      // Step 1: Triage the message
      const triageResult = await triageService.triageMessage('msg-1', 'entity-1');

      expect(triageResult.messageId).toBe('msg-1');
      expect(triageResult.urgencyScore).toBeGreaterThanOrEqual(1);
      expect(triageResult.urgencyScore).toBeLessThanOrEqual(10);
      expect(triageResult.intent).toBeDefined();
      expect(triageResult.suggestedPriority).toMatch(/^P[012]$/);
      expect(triageResult.flags).toBeInstanceOf(Array);

      // Verify triage score was persisted
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          triageScore: triageResult.urgencyScore,
          intent: triageResult.intent,
        }),
      });

      // Step 2: Generate a draft reply
      // Reset findUnique to return the message again for draft service
      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);

      // AI mock for draft - also simulate failure for template fallback
      mockedGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const draftResult = await draftService.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'FORMAL',
      });

      expect(draftResult.messageId).toBe('msg-1');
      expect(draftResult.draftBody).toBeTruthy();
      expect(draftResult.tone).toBe('FORMAL');
      expect(draftResult.suggestedSubject).toBe('Re: Quarterly Report Request');
      expect(draftResult.alternatives).toBeInstanceOf(Array);
      expect(draftResult.alternatives.length).toBe(2);
    });
  });

  describe('Batch triage flow', () => {
    it('should batch triage multiple messages and assign priority/category to each', async () => {
      const messages = [
        createMockMessage({ id: 'msg-1', body: 'This is urgent! Need response ASAP.' }),
        createMockMessage({ id: 'msg-2', body: 'Invoice #12345 for $5,000 payment due.' }),
        createMockMessage({ id: 'msg-3', body: 'Happy holidays and best wishes.' }),
      ];

      const mockEntity = createMockEntity();

      // Setup findMany for untriaged messages
      mockPrisma.message.findMany.mockResolvedValueOnce(
        messages.map((m) => ({ id: m.id }))
      );

      // Each triageMessage call will use findUnique
      let findUniqueCallIndex = 0;
      mockPrisma.message.findUnique.mockImplementation(() => {
        const msg = messages[findUniqueCallIndex % messages.length];
        findUniqueCallIndex++;
        return Promise.resolve(msg);
      });

      mockPrisma.contact.findUnique.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.message.update.mockResolvedValue({});

      // AI fails, falling back to keyword-based triage
      mockedGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const batchResult = await triageService.batchTriage({
        entityId: 'entity-1',
      });

      expect(batchResult.processed).toBe(3);
      expect(batchResult.results).toHaveLength(3);
      expect(batchResult.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(batchResult.summary).toEqual(
        expect.objectContaining({
          urgent: expect.any(Number),
          needsResponse: expect.any(Number),
          canArchive: expect.any(Number),
          flagged: expect.any(Number),
        })
      );

      // Verify each result has required fields
      for (const result of batchResult.results) {
        expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
        expect(result.urgencyScore).toBeLessThanOrEqual(10);
        expect(result.suggestedPriority).toMatch(/^P[012]$/);
        expect(result.category).toBeDefined();
      }
    });
  });

  describe('Draft refinement flow', () => {
    it('should generate initial draft and refine it based on feedback', async () => {
      const mockMessage = createMockMessage({
        body: 'Can you help me with the project timeline?',
        subject: 'Project Timeline',
      });
      const mockEntity = createMockEntity();

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);

      // Step 1: Generate initial draft (template fallback)
      mockedGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const initialDraft = await draftService.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'WARM',
      });

      expect(initialDraft.draftBody).toBeTruthy();
      expect(initialDraft.tone).toBe('WARM');

      // Step 2: Refine the draft with feedback
      mockedChat.mockRejectedValueOnce(new Error('AI unavailable'));

      const refinedDraft = await draftService.refineDraft(
        initialDraft.draftBody,
        'Make it shorter and more concise',
        'DIRECT'
      );

      expect(refinedDraft.draftBody).toBeTruthy();
      expect(refinedDraft.tone).toBe('DIRECT');
      // Refined draft should be different from or at most shorter than the original
      expect(refinedDraft.draftBody.length).toBeLessThanOrEqual(
        initialDraft.draftBody.length + 200 // tolerance for added closing words
      );
      expect(refinedDraft.alternatives).toBeInstanceOf(Array);
      expect(refinedDraft.alternatives.length).toBe(2);
    });
  });

  describe('Error resilience during triage', () => {
    it('should fall back to keyword-based scoring when AI fails', async () => {
      const mockMessage = createMockMessage({
        body: 'Please help with the contract review. This is urgent and we need the legal team involved.',
        subject: 'Contract Review Needed',
      });
      const mockEntity = createMockEntity();

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.contact.findUnique.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.message.update.mockResolvedValue(mockMessage);

      // AI fails
      mockedGenerateJSON.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const result = await triageService.triageMessage('msg-1', 'entity-1');

      // Should not throw, should return valid result using keyword fallback
      expect(result.messageId).toBe('msg-1');
      expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
      // "urgent" keyword should boost score
      expect(result.urgencyScore).toBeGreaterThanOrEqual(5);
      // "legal" and "contract" keywords should be detected
      expect(result.flags.some((f) => f.type === 'LEGAL_LANGUAGE')).toBe(true);
      expect(result.intent).toBe('URGENT');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
    });

    it('should handle missing sender contact gracefully during triage', async () => {
      const mockMessage = createMockMessage({
        body: 'Simple informational message.',
        senderId: 'nonexistent-sender',
      });
      const mockEntity = createMockEntity();

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.contact.findUnique.mockRejectedValue(new Error('Contact not found'));
      mockPrisma.entity.findUnique.mockResolvedValue(mockEntity);
      mockPrisma.message.update.mockResolvedValue(mockMessage);

      // AI fails
      mockedGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await triageService.triageMessage('msg-1', 'entity-1');

      // Should complete without error
      expect(result.messageId).toBe('msg-1');
      expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
      expect(result.suggestedPriority).toBeDefined();
    });
  });
});
