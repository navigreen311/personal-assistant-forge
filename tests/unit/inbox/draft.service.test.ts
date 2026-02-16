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

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  chat: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateText, chat } from '@/lib/ai';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockedChat = chat as jest.MockedFunction<typeof chat>;

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

    it('should call generateText with original message context', async () => {
      mockedGenerateText.mockResolvedValue('Thank you for your inquiry. I will look into this.');

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
      });

      expect(mockedGenerateText).toHaveBeenCalled();
      const prompt = mockedGenerateText.mock.calls[0][0];
      expect(prompt).toContain('Test Subject');
      expect(prompt).toContain('What is the status of the project?');
      expect(result.messageId).toBe('msg-1');
      expect(result.draftBody).toBeTruthy();
      expect(result.draftBody.length).toBeGreaterThan(10);
    });

    it('should generate reply for REQUEST intent via AI', async () => {
      (mockedPrisma.message.findUnique as jest.Mock).mockResolvedValue({
        ...mockMessage,
        body: 'Please send me the financial report for Q2.',
      });
      mockedGenerateText.mockResolvedValue('I will prepare the Q2 financial report and send it to you shortly.');

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
      });

      expect(result.draftBody).toBeTruthy();
    });

    it('should include tone preference in prompt', async () => {
      mockedGenerateText.mockResolvedValue('Dear colleague, I will look into this matter.');

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'FORMAL',
      });

      expect(result.tone).toBe('FORMAL');
      const prompt = mockedGenerateText.mock.calls[0][0];
      expect(prompt).toContain('FORMAL');
    });

    it('should include constraints in prompt', async () => {
      mockedGenerateText.mockResolvedValue('Thank you for your question.');

      await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        constraints: ['Avoid technical jargon', 'Keep under 100 words'],
      });

      const prompt = mockedGenerateText.mock.calls[0][0];
      expect(prompt).toContain('Avoid technical jargon');
      expect(prompt).toContain('Keep under 100 words');
    });

    it('should include disclaimer when requested', async () => {
      (mockedPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        name: 'Test Entity',
        complianceProfile: ['HIPAA'],
      });
      mockedGenerateText.mockResolvedValue('Thank you for your question.');

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        includeDisclaimer: true,
      });

      expect(result.complianceNotes.length).toBeGreaterThan(0);
      expect(result.draftBody).toContain('HIPAA');
    });

    it('should generate alternative drafts with different tones', async () => {
      mockedGenerateText
        .mockResolvedValueOnce('Main draft body')
        .mockResolvedValueOnce('Alternative draft 1')
        .mockResolvedValueOnce('Alternative draft 2');

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

    it('should fall back to template generation on AI failure', async () => {
      mockedGenerateText.mockRejectedValue(new Error('AI service unavailable'));

      const result = await service.generateDraft({
        messageId: 'msg-1',
        entityId: 'entity-1',
        tone: 'FORMAL',
      });

      expect(result.draftBody).toBeTruthy();
      expect(result.draftBody).toContain('Dear');
      expect(result.draftBody).toContain('Sincerely');
      expect(result.tone).toBe('FORMAL');
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
    it('should call chat with current draft and feedback', async () => {
      mockedChat.mockResolvedValue('Hey! Just wanted to let you know about the matter.');

      const result = await service.refineDraft(
        'Dear Sir, I would like to inform you about the matter.',
        'Make it more casual',
        'CASUAL'
      );

      expect(mockedChat).toHaveBeenCalled();
      const messages = mockedChat.mock.calls[0][0];
      expect(messages[0].content).toContain('Dear Sir');
      expect(messages[0].content).toContain('Make it more casual');
      expect(result.tone).toBe('CASUAL');
      expect(result.draftBody).toBeTruthy();
    });

    it('should return refined draft body from AI', async () => {
      const original = 'We need to discuss the project timeline.';
      mockedChat.mockResolvedValue('I hope you are doing well! I would love to chat about our project timeline when you have a moment.');

      const result = await service.refineDraft(original, 'Make it friendlier', 'WARM');

      expect(result.draftBody).toBeTruthy();
      expect(result.tone).toBe('WARM');
    });

    it('should fall back to heuristic refinement on AI failure', async () => {
      mockedChat.mockRejectedValue(new Error('AI unavailable'));

      const result = await service.refineDraft(
        'We need to discuss the project timeline.',
        'Make it shorter',
        'FORMAL'
      );

      expect(result.draftBody).toBeTruthy();
      expect(result.tone).toBe('FORMAL');
    });
  });
});
