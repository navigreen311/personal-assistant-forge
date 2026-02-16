import { DraftService } from '@/modules/inbox/draft.service';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
    },
    entity: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const mockMessage = {
  id: 'msg-1',
  channel: 'EMAIL',
  senderId: 'sender-1',
  recipientId: 'recipient-1',
  entityId: 'entity-1',
  threadId: null,
  subject: 'Test Subject',
  body: 'What is the status of the project?',
  triageScore: 5,
  intent: 'INQUIRY',
  sensitivity: 'INTERNAL',
  draftStatus: null,
  attachments: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DraftService', () => {
  let service: DraftService;

  beforeEach(() => {
    service = new DraftService();
    jest.clearAllMocks();
  });

  describe('generateDraft', () => {
    beforeEach(() => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        name: 'Test Entity',
        complianceProfile: [],
      });
    });

    it('should generate reply for INQUIRY intent', async () => {
      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
      });

      expect(result.messageId).toBe('msg-1');
      expect(result.draftBody).toBeTruthy();
      expect(result.draftBody.length).toBeGreaterThan(10);
    });

    it('should generate reply for REQUEST intent', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue({
        ...mockMessage,
        body: 'Please send me the financial report for Q2.',
      });

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
      });

      expect(result.draftBody).toBeTruthy();
    });

    it('should apply FORMAL tone when specified', async () => {
      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'FORMAL',
      });

      expect(result.tone).toBe('FORMAL');
      expect(result.draftBody).toContain('Dear');
      expect(result.draftBody).toContain('Sincerely');
    });

    it('should apply CASUAL tone when specified', async () => {
      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'CASUAL',
      });

      expect(result.tone).toBe('CASUAL');
      expect(result.draftBody).toContain('Hey');
      expect(result.draftBody).toContain('Cheers');
    });

    it('should include disclaimer when requested', async () => {
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        name: 'Test Entity',
        complianceProfile: ['HIPAA'],
      });

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        includeDisclaimer: true,
      });

      expect(result.complianceNotes.length).toBeGreaterThan(0);
      expect(result.draftBody).toContain('HIPAA');
    });

    it('should provide alternative drafts with different tones', async () => {
      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'FORMAL',
      });

      expect(result.alternatives.length).toBeGreaterThanOrEqual(1);
      expect(result.alternatives[0]).toHaveProperty('tone');
      expect(result.alternatives[0]).toHaveProperty('body');
      expect(result.alternatives[0].tone).not.toBe('FORMAL');
    });

    it('should respect maxLength constraint', async () => {
      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        maxLength: 50,
      });

      expect(result.draftBody.length).toBeLessThanOrEqual(50);
    });
  });

  describe('generateFromTemplate', () => {
    it('should substitute variables in canned response', async () => {
      const result = await service.generateFromTemplate(
        'canned-1',
        { contact_name: 'John', company: 'Acme Inc' }
      );

      expect(result.draftBody).toBeTruthy();
      expect(result.confidenceScore).toBeGreaterThan(0);
    });

    it('should handle missing variables gracefully', async () => {
      const result = await service.generateFromTemplate('canned-1', {});
      expect(result.draftBody).toBeTruthy();
    });
  });

  describe('refineDraft', () => {
    it('should adjust tone based on feedback', async () => {
      const result = await service.refineDraft(
        'Dear Sir, I would like to inform you about the matter.',
        'Make it more casual',
        'CASUAL'
      );

      expect(result.tone).toBe('CASUAL');
      expect(result.draftBody).toBeTruthy();
    });

    it('should maintain core content while changing style', async () => {
      const original = 'We need to discuss the project timeline.';
      const result = await service.refineDraft(original, 'Make it friendlier', 'WARM');

      expect(result.draftBody).toBeTruthy();
      expect(result.tone).toBe('WARM');
    });
  });
});
