/**
 * E2E Test: Inbox Management
 * Tests full inbox flows end-to-end:
 *   message creation and listing, triage scoring, draft generation and refinement,
 *   follow-up creation and tracking, canned response management, batch triage
 *
 * Services under test:
 * - InboxService (inbox.service.ts)
 * - TriageService (triage.service.ts)
 * - DraftService (draft.service.ts)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  message: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  contact: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  entity: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  followUpReminder: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  cannedResponse: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
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
  v4: jest.fn(() => 'e2e-inbox-uuid'),
}));

import { InboxService } from '@/modules/inbox/inbox.service';
import { TriageService } from '@/modules/inbox/triage.service';
import { DraftService } from '@/modules/inbox/draft.service';
import { generateJSON, generateText, chat } from '@/lib/ai';
// P-06: these services now take a VerifiedEntityId for the entity in scope and
// the authenticated userId for rows they own. See
// docs/parallel-build/tenancy-pattern.md trap 3.
import { verifiedEntityIdForTest } from '../helpers/factories';

const SCOPE = verifiedEntityIdForTest('entity-1');
const USER = 'user-1';

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
    read: false,
    starred: false,
    attachments: [],
    deletedAt: null,
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

describe('Inbox Management E2E Tests', () => {
  let inboxService: InboxService;
  let triageService: TriageService;
  let draftService: DraftService;

  // In-memory stores for stateful Prisma mocking
  let followUpStore: Record<string, unknown>[];
  let cannedStore: Record<string, unknown>[];
  let followUpIdCounter: number;
  let cannedIdCounter: number;

  beforeEach(() => {
    jest.clearAllMocks();
    inboxService = new InboxService();
    triageService = new TriageService();
    draftService = new DraftService();
    mockedGenerateJSON.mockRejectedValue(new Error('AI unavailable'));
    mockedGenerateText.mockRejectedValue(new Error('AI unavailable'));
    mockedChat.mockRejectedValue(new Error('AI unavailable'));

    // Reset in-memory stores
    followUpStore = [];
    cannedStore = [];
    followUpIdCounter = 1;
    cannedIdCounter = 1;

    // Message writes now go through updateMany and read { count }.
    mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

    // Default empty returns for list/message queries
    mockPrisma.followUpReminder.findMany.mockImplementation(() => Promise.resolve(followUpStore));
    mockPrisma.followUpReminder.findFirst.mockImplementation(() => Promise.resolve(null));
    mockPrisma.followUpReminder.findFirst.mockImplementation((args: { where: { id: string } }) => {
      return Promise.resolve(followUpStore.find((f: any) => f.id === args.where.id) ?? null);
    });
    mockPrisma.followUpReminder.create.mockImplementation((args: { data: any }) => {
      const row = { id: `fu-${followUpIdCounter++}`, ...args.data, createdAt: new Date(), updatedAt: new Date() };
      followUpStore.push(row);
      return Promise.resolve(row);
    });
    // updateMany / deleteMany return a { count }, and the service reads
    // count === 0 as not-found -- the scope now rides in the WHERE clause.
    mockPrisma.followUpReminder.updateMany.mockImplementation((args: { where: { id: string }; data: any }) => {
      const idx = followUpStore.findIndex((f: any) => f.id === args.where.id);
      if (idx >= 0) {
        followUpStore[idx] = { ...followUpStore[idx], ...args.data };
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });

    mockPrisma.cannedResponse.findMany.mockImplementation(() => Promise.resolve(cannedStore));
    mockPrisma.cannedResponse.findFirst.mockImplementation((args: { where: { id: string } }) => {
      return Promise.resolve(cannedStore.find((c: any) => c.id === args.where.id) ?? null);
    });
    mockPrisma.cannedResponse.create.mockImplementation((args: { data: any }) => {
      const row = { id: `cr-${cannedIdCounter++}`, ...args.data, createdAt: new Date(), updatedAt: new Date() };
      cannedStore.push(row);
      return Promise.resolve(row);
    });
    mockPrisma.cannedResponse.updateMany.mockImplementation((args: { where: { id: string }; data: any }) => {
      const idx = cannedStore.findIndex((c: any) => c.id === args.where.id);
      if (idx >= 0) {
        cannedStore[idx] = { ...cannedStore[idx], ...args.data, updatedAt: new Date() };
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });
    mockPrisma.cannedResponse.deleteMany.mockImplementation((args: { where: { id: string } }) => {
      const idx = cannedStore.findIndex((c: any) => c.id === args.where.id);
      if (idx >= 0) {
        cannedStore.splice(idx, 1);
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });
  });

  // =========================================================================
  // Message creation and listing
  // =========================================================================
  describe('Message creation and listing', () => {
    it('should list inbox items with pagination and stats', async () => {
      const messages = [
        createMockMessage({ id: 'msg-1', triageScore: 8, intent: 'URGENT', entity: createMockEntity(), contact: null }),
        createMockMessage({ id: 'msg-2', triageScore: 3, intent: 'FYI', entity: createMockEntity(), contact: null }),
      ];

      mockPrisma.message.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce(messages);
      mockPrisma.message.count.mockResolvedValue(2);

      const result = await inboxService.listInbox(SCOPE, {
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.stats).toBeDefined();
      expect(result.stats.total).toBe(2);
    });

    it('should get message detail with thread context', async () => {
      const msg = createMockMessage({
        id: 'detail-msg',
        threadId: 'thread-1',
        intent: 'REQUEST',
        entity: createMockEntity(),
        contact: null,
      });
      const threadMessages = [
        createMockMessage({ id: 'thread-msg-1', threadId: 'thread-1' }),
        createMockMessage({ id: 'thread-msg-2', threadId: 'thread-1' }),
      ];

      mockPrisma.message.findFirst.mockResolvedValue(msg);
      mockPrisma.message.findMany.mockResolvedValue(threadMessages);

      const detail = await inboxService.getMessageDetail('detail-msg', SCOPE);

      expect(detail).not.toBeNull();
      expect(detail!.message.id).toBe('detail-msg');
      expect(detail!.threadMessages).toHaveLength(2);
    });

    it('should mark a message as read and toggle star, scoped to the entity', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(
        createMockMessage({ id: 'rw-msg' })
      );

      await inboxService.markAsRead('rw-msg', true, SCOPE);
      await inboxService.toggleStar('rw-msg', SCOPE);

      // markAsRead no longer reads first -- it writes with the scope in the
      // WHERE clause and treats count === 0 as not-found -- so the assertion
      // is on the write, and the entity is part of it.
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'rw-msg', entityId: SCOPE },
        data: { read: true },
      });
      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
        where: { id: 'rw-msg', entityId: SCOPE },
      });
    });

    it('should throw when marking a nonexistent message as read', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);
      mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        inboxService.markAsRead('bad-msg', true, SCOPE)
      ).rejects.toThrow('Message not found: bad-msg');
    });

    it('should archive a message, scoped to the entity', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(
        createMockMessage({ id: 'archive-msg' })
      );

      await inboxService.archiveMessage('archive-msg', SCOPE);

      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'archive-msg', entityId: SCOPE },
        data: { read: true, starred: false },
      });
    });

    it('should send a draft message', async () => {
      const draftMsg = createMockMessage({ id: 'draft-msg', draftStatus: 'DRAFT' });
      const sentMsg = createMockMessage({ id: 'draft-msg', draftStatus: 'SENT' });

      mockPrisma.message.findFirst.mockResolvedValue(draftMsg);
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const sent = await inboxService.sendDraft('draft-msg', SCOPE);

      expect(sent.draftStatus).toBe('SENT');
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'draft-msg', entityId: SCOPE },
        data: { draftStatus: 'SENT' },
      });
    });

    it('should reject sending a non-draft message', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(
        createMockMessage({ id: 'not-draft', draftStatus: null })
      );

      await expect(
        inboxService.sendDraft('not-draft', SCOPE)
      ).rejects.toThrow('Message is not a draft');
    });
  });

  // =========================================================================
  // Triage scoring flow
  // =========================================================================
  describe('Triage scoring flow', () => {
    it('should triage a message with urgent keywords and assign high score', async () => {
      const urgentMessage = createMockMessage({
        id: 'urgent-msg',
        body: 'This is URGENT! We need the contract reviewed ASAP. The legal team needs it immediately.',
        subject: 'Urgent: Contract Review',
      });

      mockPrisma.message.findFirst.mockResolvedValue(urgentMessage);
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await triageService.triageMessage('urgent-msg', SCOPE);

      expect(result.messageId).toBe('urgent-msg');
      expect(result.urgencyScore).toBeGreaterThanOrEqual(5);
      expect(result.intent).toBe('URGENT');
      expect(result.suggestedPriority).toMatch(/^P[01]$/);
      expect(result.flags.some((f) => f.type === 'LEGAL_LANGUAGE')).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should triage a financial message and detect money flags', async () => {
      const financialMessage = createMockMessage({
        id: 'fin-msg',
        body: 'Please find attached invoice #12345 for $15,000. Payment is due by end of month.',
        subject: 'Invoice #12345',
      });

      mockPrisma.message.findFirst.mockResolvedValue(financialMessage);
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await triageService.triageMessage('fin-msg', SCOPE);

      expect(result.intent).toBe('FINANCIAL');
      expect(result.category).toBe('FINANCE');
      expect(result.flags.some((f) => f.type === 'MONEY_MENTIONED')).toBe(true);
      expect(result.flags.some((f) => f.type === 'DEADLINE_MENTIONED')).toBe(true);
    });

    it('should boost score for VIP sender', async () => {
      const vipMessage = createMockMessage({
        id: 'vip-msg',
        body: 'Quick question about the project timeline.',
      });
      const vipContact = {
        id: 'sender-1',
        name: 'CEO Jane',
        tags: ['VIP'],
        relationshipScore: 95,
        email: 'jane@example.com',
        channels: [],
        commitments: [],
        preferences: {},
      };

      mockPrisma.message.findFirst.mockResolvedValue(vipMessage);
      mockPrisma.contact.findFirst.mockResolvedValue(vipContact);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await triageService.triageMessage('vip-msg', SCOPE);

      expect(result.urgencyScore).toBeGreaterThanOrEqual(5);
      expect(result.flags.some((f) => f.type === 'VIP_SENDER')).toBe(true);
    });

    it('should detect PII and classify as RESTRICTED sensitivity', async () => {
      const piiMessage = createMockMessage({
        id: 'pii-msg',
        body: 'SSN: 123-45-6789. Date of birth: 03/15/1985. Please update the records.',
      });

      mockPrisma.message.findFirst.mockResolvedValue(piiMessage);
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await triageService.triageMessage('pii-msg', SCOPE);

      expect(result.sensitivity).toBe('RESTRICTED');
      expect(result.flags.some((f) => f.type === 'PII_DETECTED')).toBe(true);
    });

    it('should persist triage score and intent back to the message', async () => {
      const msg = createMockMessage({ id: 'persist-msg', body: 'Please help with this request.' });

      mockPrisma.message.findFirst.mockResolvedValue(msg);
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await triageService.triageMessage('persist-msg', SCOPE);

      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'persist-msg', entityId: SCOPE },
        data: expect.objectContaining({
          triageScore: result.urgencyScore,
          intent: result.intent,
        }),
      });
    });

    it('should manually update triage score', async () => {
      const msg = createMockMessage({
        id: 'manual-msg',
        body: 'Some message body for testing manual override.',
        subject: 'Manual Override Test',
      });

      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.message.findFirst.mockResolvedValue(msg);

      const result = await triageService.updateTriageScore('manual-msg', 9, 'Escalated by manager', SCOPE);

      expect(result.urgencyScore).toBe(9);
      expect(result.suggestedPriority).toBe('P0');
      expect(result.reasoning).toContain('Manually updated to 9');
      expect(result.confidence).toBe(1.0);
    });
  });

  // =========================================================================
  // Draft generation and refinement
  // =========================================================================
  describe('Draft generation and refinement', () => {
    it('should generate a formal draft reply using template fallback', async () => {
      const msg = createMockMessage({
        id: 'draft-reply-msg',
        body: 'Could you please send the quarterly report?',
        subject: 'Quarterly Report',
      });

      mockPrisma.message.findFirst.mockResolvedValue(msg);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());

      const draft = await draftService.generateDraft({
        messageId: 'draft-reply-msg',
        tone: 'FORMAL',
      }, SCOPE);

      expect(draft.messageId).toBe('draft-reply-msg');
      expect(draft.draftBody).toBeTruthy();
      expect(draft.tone).toBe('FORMAL');
      expect(draft.suggestedSubject).toBe('Re: Quarterly Report');
      expect(draft.alternatives).toBeInstanceOf(Array);
      expect(draft.alternatives.length).toBe(2);
      expect(draft.draftBody).toContain('Dear');
    });

    it('should generate drafts with different tones for comparison', async () => {
      const msg = createMockMessage({
        id: 'multi-tone-msg',
        body: 'When can we schedule a call?',
        subject: 'Meeting Request',
      });

      mockPrisma.message.findFirst.mockResolvedValue(msg);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());

      const formalDraft = await draftService.generateDraft({
        messageId: 'multi-tone-msg',
        tone: 'FORMAL',
      }, SCOPE);

      const casualDraft = await draftService.generateDraft({
        messageId: 'multi-tone-msg',
        tone: 'CASUAL',
      }, SCOPE);

      expect(formalDraft.tone).toBe('FORMAL');
      expect(casualDraft.tone).toBe('CASUAL');
      expect(formalDraft.draftBody).toContain('Dear');
      expect(casualDraft.draftBody).toContain('Hey');
      expect(formalDraft.alternatives.length).toBe(2);
      expect(casualDraft.alternatives.length).toBe(2);
    });

    it('should refine a draft based on feedback to make it shorter', async () => {
      const initialBody = 'Dear recipient, I would like to inform you about the current status of the project. We have made significant progress on all fronts and expect to complete the deliverables on time. Please let me know if you have any questions.';

      const refinedDraft = await draftService.refineDraft(
        initialBody,
        'Make it shorter and more concise',
        'DIRECT'
      );

      expect(refinedDraft.draftBody).toBeTruthy();
      expect(refinedDraft.tone).toBe('DIRECT');
      expect(refinedDraft.draftBody.length).toBeLessThanOrEqual(initialBody.length + 200);
      expect(refinedDraft.alternatives).toHaveLength(2);
    });

    it('should include compliance disclaimers when requested', async () => {
      const msg = createMockMessage({ id: 'hipaa-msg', body: 'Patient records update.' });
      const hipaaEntity = createMockEntity({ complianceProfile: ['HIPAA'] });

      mockPrisma.message.findFirst.mockResolvedValue(msg);
      mockPrisma.entity.findUnique.mockResolvedValue(hipaaEntity);

      const draft = await draftService.generateDraft({
        messageId: 'hipaa-msg',
        tone: 'FORMAL',
        includeDisclaimer: true,
      }, SCOPE);

      expect(draft.complianceNotes.length).toBeGreaterThan(0);
      expect(draft.draftBody).toContain('HIPAA');
    });

    it('should apply tone word substitutions correctly', () => {
      const body = 'I need to get some help with the start of the project.';

      const formal = draftService.applyTone(body, 'FORMAL');
      expect(formal).toContain('require');
      expect(formal).toContain('obtain');
      expect(formal).toContain('assist');
      expect(formal).toContain('commence');
    });
  });

  // =========================================================================
  // Follow-up creation and tracking
  // =========================================================================
  describe('Follow-up creation and tracking', () => {
    it('should create a follow-up, list it, and complete it', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(createMockMessage({ id: 'fu-msg' }));

      const followUp = await inboxService.createFollowUp({
        messageId: 'fu-msg',
        reminderAt: new Date('2026-03-01T09:00:00Z'),
        reason: 'Awaiting contract signature',
      }, SCOPE, USER);

      expect(followUp.id).toBeTruthy();
      expect(followUp.messageId).toBe('fu-msg');
      expect(followUp.status).toBe('PENDING');
      expect(followUp.reason).toBe('Awaiting contract signature');

      const followUps = await inboxService.listFollowUps(USER, SCOPE);
      expect(followUps.length).toBeGreaterThanOrEqual(1);
      expect(followUps.some((f) => f.id === followUp.id)).toBe(true);

      await inboxService.completeFollowUp(followUp.id, USER);

      const updatedList = await inboxService.listFollowUps(USER, SCOPE);
      const completed = updatedList.find((f) => f.id === followUp.id);
      expect(completed?.status).toBe('COMPLETED');
    });

    it('should snooze a follow-up to a new date', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(createMockMessage({ id: 'snooze-msg' }));

      const followUp = await inboxService.createFollowUp({
        messageId: 'snooze-msg',
        reminderAt: new Date('2026-03-01T09:00:00Z'),
      }, SCOPE, USER);

      const newDate = new Date('2026-03-15T09:00:00Z');
      await inboxService.snoozeFollowUp(followUp.id, newDate, USER);

      const followUps = await inboxService.listFollowUps(USER, SCOPE);
      const snoozed = followUps.find((f) => f.id === followUp.id);
      expect(snoozed?.reminderAt).toEqual(newDate);
      expect(snoozed?.status).toBe('PENDING');
    });

    it('should cancel a follow-up', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(createMockMessage({ id: 'cancel-fu-msg' }));

      const followUp = await inboxService.createFollowUp({
        messageId: 'cancel-fu-msg',
        reminderAt: new Date('2026-04-01T09:00:00Z'),
      }, SCOPE, USER);

      await inboxService.cancelFollowUp(followUp.id, USER);

      const followUps = await inboxService.listFollowUps(USER, SCOPE);
      const cancelled = followUps.find((f) => f.id === followUp.id);
      expect(cancelled?.status).toBe('CANCELLED');
    });

    it('should throw when completing a nonexistent follow-up', async () => {
      await expect(
        inboxService.completeFollowUp('nonexistent-fu', USER)
      ).rejects.toThrow('Follow-up not found');
    });

    it('should throw when creating a follow-up for a nonexistent message', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await expect(
        inboxService.createFollowUp({
          messageId: 'bad-msg',
          reminderAt: new Date(),
        }, SCOPE, USER)
      ).rejects.toThrow('Message not found');
    });
  });

  // =========================================================================
  // Canned response management
  // =========================================================================
  describe('Canned response management', () => {
    it('should CRUD canned responses end-to-end', async () => {
      const canned = await inboxService.createCannedResponse({
        name: 'Out of Office',
        channel: 'EMAIL',
        category: 'auto-reply',
        subject: 'Out of Office',
        body: 'I am currently out of office and will return on {{return_date}}.',
        variables: ['return_date'],
        tone: 'FORMAL',
      }, SCOPE, USER);

      expect(canned.id).toBeTruthy();
      expect(canned.name).toBe('Out of Office');
      expect(canned.variables).toContain('return_date');
      expect(canned.usageCount).toBe(0);

      const fetched = await inboxService.getCannedResponse(canned.id, USER);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Out of Office');

      const list = await inboxService.listCannedResponses(SCOPE, USER);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some((r) => r.id === canned.id)).toBe(true);

      const updated = await inboxService.updateCannedResponse(
        canned.id,
        {
          body: 'I am out of office. Back on {{return_date}}. For urgent matters, contact {{backup_contact}}.',
          variables: ['return_date', 'backup_contact'],
        },
        USER
      );

      expect(updated.variables).toContain('backup_contact');
      expect(updated.body).toContain('urgent');

      await inboxService.incrementCannedResponseUsage(canned.id, USER);
      const afterUsage = await inboxService.getCannedResponse(canned.id, USER);
      expect(afterUsage!.usageCount).toBe(1);
      expect(afterUsage!.lastUsed).toBeInstanceOf(Date);

      await inboxService.deleteCannedResponse(canned.id, USER);
      const afterDelete = await inboxService.getCannedResponse(canned.id, USER);
      expect(afterDelete).toBeNull();
    });

    it('should filter canned responses by channel', async () => {
      await inboxService.createCannedResponse({
        name: 'Email Welcome',
        channel: 'EMAIL',
        category: 'welcome',
        body: 'Welcome via email!',
        tone: 'WARM',
      }, SCOPE, USER);

      await inboxService.createCannedResponse({
        name: 'SMS Confirmation',
        channel: 'SMS',
        category: 'confirmation',
        body: 'Confirmed via SMS.',
        tone: 'DIRECT',
      }, SCOPE, USER);

      const emailOnly = await inboxService.listCannedResponses(SCOPE, USER, 'EMAIL');
      const smsOnly = await inboxService.listCannedResponses(SCOPE, USER, 'SMS');

      expect(emailOnly.every((r) => r.channel === 'EMAIL')).toBe(true);
      expect(smsOnly.every((r) => r.channel === 'SMS')).toBe(true);
    });

    it('should throw when updating a nonexistent canned response', async () => {
      await expect(
        inboxService.updateCannedResponse('nonexistent', { body: 'new body' }, USER)
      ).rejects.toThrow('Canned response not found');
    });

    it('should throw when deleting a nonexistent canned response', async () => {
      await expect(
        inboxService.deleteCannedResponse('nonexistent', USER)
      ).rejects.toThrow('Canned response not found');
    });
  });

  // =========================================================================
  // Batch triage
  // =========================================================================
  describe('Batch triage', () => {
    it('should batch triage multiple messages and produce a summary', async () => {
      const messages = [
        createMockMessage({ id: 'bt-1', body: 'URGENT: Server is down! Fix ASAP. Invoice #123 for $5,000 payment due by tomorrow. Contract liability issue.', channel: 'VOICE' }),
        createMockMessage({ id: 'bt-2', body: 'Invoice #999 for $2,500 payment due Friday.' }),
        createMockMessage({ id: 'bt-3', body: 'Happy holidays! Best wishes for the new year.' }),
        createMockMessage({ id: 'bt-4', body: 'Could you please review the attached document?' }),
      ];

      mockPrisma.message.findMany.mockResolvedValueOnce(
        messages.map((m) => ({ id: m.id }))
      );

      let findUniqueCallIndex = 0;
      mockPrisma.message.findFirst.mockImplementation(() => {
        const msg = messages[findUniqueCallIndex % messages.length];
        findUniqueCallIndex++;
        return Promise.resolve(msg);
      });

      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const batchResult = await triageService.batchTriage({}, SCOPE);

      expect(batchResult.processed).toBe(4);
      expect(batchResult.results).toHaveLength(4);
      expect(batchResult.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(batchResult.summary.urgent).toBeGreaterThanOrEqual(1);
      expect(typeof batchResult.summary.canArchive).toBe('number');
      expect(typeof batchResult.summary.flagged).toBe('number');

      for (const result of batchResult.results) {
        expect(result.urgencyScore).toBeGreaterThanOrEqual(1);
        expect(result.urgencyScore).toBeLessThanOrEqual(10);
        expect(result.suggestedPriority).toMatch(/^P[012]$/);
        expect(result.intent).toBeTruthy();
      }
    });

    it('should batch triage specific message IDs when provided', async () => {
      const messages = [
        createMockMessage({ id: 'specific-1', body: 'Please review this urgent matter.' }),
        createMockMessage({ id: 'specific-2', body: 'FYI - meeting notes attached.' }),
      ];

      let callIdx = 0;
      mockPrisma.message.findFirst.mockImplementation(() => {
        const msg = messages[callIdx % messages.length];
        callIdx++;
        return Promise.resolve(msg);
      });

      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await triageService.batchTriage({
        messageIds: ['specific-1', 'specific-2'],
      }, SCOPE);

      expect(result.processed).toBe(2);
      expect(result.results).toHaveLength(2);
    });
  });

  // =========================================================================
  // Cross-module: triage -> draft -> refine -> follow-up
  // =========================================================================
  describe('Cross-module: triage -> draft -> follow-up flow', () => {
    it('should triage a message, generate a draft reply, refine it, and set a follow-up', async () => {
      const msg = createMockMessage({
        id: 'cross-msg',
        body: 'Could you please send the contract for review? This is time-sensitive and we need it by Friday.',
        subject: 'Contract Review Request',
      });

      mockPrisma.message.findFirst.mockResolvedValue(msg);
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.entity.findUnique.mockResolvedValue(createMockEntity());
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      // Step 1: Triage
      const triageResult = await triageService.triageMessage('cross-msg', SCOPE);
      expect(triageResult.urgencyScore).toBeGreaterThanOrEqual(3);
      expect(triageResult.flags.some((f) => f.type === 'DEADLINE_MENTIONED')).toBe(true);

      // Step 2: Generate draft
      const draft = await draftService.generateDraft({
        messageId: 'cross-msg',
        tone: 'DIPLOMATIC',
      }, SCOPE);
      expect(draft.draftBody).toBeTruthy();
      expect(draft.suggestedSubject).toBe('Re: Contract Review Request');

      // Step 3: Refine draft
      const refined = await draftService.refineDraft(
        draft.draftBody,
        'Make it more direct and add a specific timeline commitment',
        'DIRECT'
      );
      expect(refined.draftBody).toBeTruthy();
      expect(refined.tone).toBe('DIRECT');

      // Step 4: Set follow-up
      const followUp = await inboxService.createFollowUp({
        messageId: 'cross-msg',
        reminderAt: new Date('2026-03-05T09:00:00Z'),
        reason: 'Follow up on contract review response',
      }, SCOPE, USER);
      expect(followUp.status).toBe('PENDING');
      expect(followUp.reason).toContain('contract review');
    });
  });

  // =========================================================================
  // Inbox stats
  // =========================================================================
  describe('Inbox stats', () => {
    it('should calculate inbox statistics across messages', async () => {
      const messages = [
        { id: 'stat-1', channel: 'EMAIL', triageScore: 9, intent: 'URGENT', draftStatus: null },
        { id: 'stat-2', channel: 'EMAIL', triageScore: 3, intent: 'FYI', draftStatus: null },
        { id: 'stat-3', channel: 'SMS', triageScore: 7, intent: 'REQUEST', draftStatus: null },
        { id: 'stat-4', channel: 'SLACK', triageScore: 5, intent: 'INQUIRY', draftStatus: 'SENT' },
      ];

      mockPrisma.message.findMany.mockResolvedValue(messages);

      const stats = await inboxService.getInboxStats(SCOPE);

      expect(stats.total).toBe(4);
      expect(stats.unread).toBe(4);
      expect(stats.urgent).toBe(1);
      expect(stats.needsResponse).toBeGreaterThanOrEqual(1);
      expect(stats.byChannel.EMAIL).toBe(2);
      expect(stats.byChannel.SMS).toBe(1);
      expect(stats.byChannel.SLACK).toBe(1);
      expect(stats.avgTriageScore).toBeGreaterThan(0);
    });
  });
});
