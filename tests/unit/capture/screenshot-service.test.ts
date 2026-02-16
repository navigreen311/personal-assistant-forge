jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn().mockResolvedValue({ id: 'doc-screenshot-1' }),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { ScreenshotService } from '@/modules/capture/services/screenshot-service';

const { prisma } = jest.requireMock('@/lib/db') as {
  prisma: { document: { create: jest.Mock } };
};
const { generateJSON } = jest.requireMock('@/lib/ai') as {
  generateJSON: jest.Mock;
};

describe('ScreenshotService', () => {
  let service: ScreenshotService;

  beforeEach(() => {
    service = new ScreenshotService();
    jest.clearAllMocks();
  });

  describe('analyzeScreenshot', () => {
    it('should extract actions from text using regex patterns', async () => {
      const result = await service.analyzeScreenshot(
        'Contact john@example.com or call (555) 123-4567',
      );

      expect(result.suggestedActions.length).toBeGreaterThan(0);
      expect(result.suggestedActions.some(a => a.type === 'CREATE_CONTACT')).toBe(true);
    });

    it('should store screenshot metadata in Prisma Document', async () => {
      await service.analyzeScreenshot('Some screenshot text', 'entity-1');

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SCREENSHOT',
          entityId: 'entity-1',
          status: 'DRAFT',
          title: expect.stringContaining('Screenshot'),
        }),
      });
    });

    it('should return document ID with analysis results', async () => {
      const result = await service.analyzeScreenshot('Test text');

      expect(result.documentId).toBe('doc-screenshot-1');
      expect(result.extractedText).toBe('Test text');
      expect(Array.isArray(result.suggestedActions)).toBe(true);
    });

    it('should use empty string entityId when not provided', async () => {
      await service.analyzeScreenshot('Test text');

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: '',
        }),
      });
    });
  });

  describe('analyzeScreenshotWithAI', () => {
    it('should call generateJSON for AI-powered action extraction', async () => {
      generateJSON.mockResolvedValueOnce({
        actions: [
          { type: 'CREATE_TASK', data: { title: 'Review proposal' }, confidence: 0.9 },
        ],
      });

      const actions = await service.analyzeScreenshotWithAI('Please review the proposal by Friday');

      expect(generateJSON).toHaveBeenCalled();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('CREATE_TASK');
    });

    it('should fallback to regex extraction on AI failure', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const actions = await service.analyzeScreenshotWithAI(
        'Contact john@example.com about the meeting on Friday',
      );

      // Should fall back to regex-based extraction
      expect(actions.some(a => a.type === 'CREATE_CONTACT')).toBe(true);
    });

    it('should handle empty actions array from AI', async () => {
      generateJSON.mockResolvedValueOnce({ actions: [] });

      const actions = await service.analyzeScreenshotWithAI('Some generic text');
      expect(actions).toEqual([]);
    });

    it('should handle null actions from AI', async () => {
      generateJSON.mockResolvedValueOnce({});

      const actions = await service.analyzeScreenshotWithAI('Some text');
      expect(actions).toEqual([]);
    });
  });

  describe('extractFromClipboard', () => {
    it('should detect email addresses as CREATE_CONTACT actions', async () => {
      // AI succeeds → uses AI
      generateJSON.mockResolvedValueOnce({
        actions: [
          { type: 'CREATE_CONTACT', data: { email: 'test@example.com' }, confidence: 0.9 },
        ],
      });

      const actions = await service.extractFromClipboard('Contact test@example.com');

      expect(actions.some(a => a.type === 'CREATE_CONTACT')).toBe(true);
    });

    it('should detect phone numbers as CREATE_CONTACT actions', async () => {
      // AI fails → falls back to regex
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const actions = await service.extractFromClipboard('Call me at (555) 123-4567');

      expect(actions.some(a => a.type === 'CREATE_CONTACT')).toBe(true);
      expect(actions.some(a => a.data.phone)).toBe(true);
    });

    it('should detect action items as CREATE_TASK actions', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const actions = await service.extractFromClipboard(
        'I need to finish the quarterly report by next Friday',
      );

      expect(actions.some(a => a.type === 'CREATE_TASK')).toBe(true);
    });

    it('should detect URLs as ADD_NOTE actions', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const actions = await service.extractFromClipboard(
        'Check this article: https://example.com/article-about-ai',
      );

      expect(actions.some(a => a.type === 'ADD_NOTE')).toBe(true);
      expect(actions.some(a => a.data.url)).toBe(true);
    });
  });
});
