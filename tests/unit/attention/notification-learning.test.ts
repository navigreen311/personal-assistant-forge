import {
  analyzePatterns,
  getSuggestions,
} from '@/modules/attention/services/notification-learning-service';
import { notificationStore } from '@/modules/attention/services/priority-router';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    suggestions: ['AI: Mute low-priority notifications.', 'AI: Batch email digests.'],
  }),
}));

// Mock dependencies used by priority-router to prevent import errors
jest.mock('@/modules/attention/services/attention-budget-service', () => ({
  consumeBudget: jest.fn(),
}));

jest.mock('@/modules/attention/services/dnd-service', () => ({
  isDNDActive: jest.fn().mockResolvedValue(false),
  checkVIPBreakthrough: jest.fn().mockResolvedValue(false),
}));

const { generateJSON } = require('@/lib/ai');

describe('NotificationLearningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationStore.clear();
  });

  describe('analyzePatterns', () => {
    it('should return patterns grouped by source', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T1', body: 'B1',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: true, isBundled: false, createdAt: new Date(),
      });
      notificationStore.set('n2', {
        id: 'n2', userId: 'user-1', title: 'T2', body: 'B2',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });
      notificationStore.set('n3', {
        id: 'n3', userId: 'user-1', title: 'T3', body: 'B3',
        source: 'slack', priority: 'P0' as const, routedAction: 'INTERRUPT' as const,
        isRead: true, isBundled: false, createdAt: new Date(),
      });

      const result = await analyzePatterns('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.patterns).toHaveLength(2);

      const emailPattern = result.patterns.find((p) => p.source === 'email');
      expect(emailPattern).toBeDefined();
      expect(emailPattern!.averageOpenRate).toBe(0.5);

      const slackPattern = result.patterns.find((p) => p.source === 'slack');
      expect(slackPattern).toBeDefined();
      expect(slackPattern!.averageOpenRate).toBe(1);
    });

    it('should return empty patterns for user with no notifications', async () => {
      const result = await analyzePatterns('user-empty');

      expect(result.userId).toBe('user-empty');
      expect(result.patterns).toHaveLength(0);
    });

    it('should include AI-generated suggestions', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T1', body: 'B1',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: true, isBundled: false, createdAt: new Date(),
      });

      const result = await analyzePatterns('user-1');

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should filter notifications by userId only', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T1', body: 'B1',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: true, isBundled: false, createdAt: new Date(),
      });
      notificationStore.set('n2', {
        id: 'n2', userId: 'user-2', title: 'T2', body: 'B2',
        source: 'slack', priority: 'P0' as const, routedAction: 'INTERRUPT' as const,
        isRead: true, isBundled: false, createdAt: new Date(),
      });

      const result = await analyzePatterns('user-1');
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].source).toBe('email');
    });
  });

  describe('getSuggestions', () => {
    it('should return AI suggestions when available', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: true, isBundled: false, createdAt: new Date(),
      });

      const suggestions = await getSuggestions('user-1');

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(suggestions).toContain('AI: Mute low-priority notifications.');
    });

    it('should return fallback suggestion for rarely opened sources', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      // Create 4 notifications from same source, none read
      for (let i = 0; i < 4; i++) {
        notificationStore.set(`n${i}`, {
          id: `n${i}`, userId: 'user-1', title: 'T', body: 'B',
          source: 'newsletter', priority: 'P2' as const, routedAction: 'WEEKLY_REVIEW' as const,
          isRead: false, isBundled: false, createdAt: new Date(),
        });
      }

      const suggestions = await getSuggestions('user-1');
      expect(suggestions.some((s: string) => s.includes('newsletter'))).toBe(true);
      expect(suggestions.some((s: string) => s.includes('muting'))).toBe(true);
    });

    it('should return default monitoring message for users with no notifications', async () => {
      const suggestions = await getSuggestions('user-empty');
      expect(suggestions).toEqual([
        'Keep monitoring your notification patterns for better suggestions.',
      ]);
    });

    it('should fall back gracefully when AI fails and no rule-based suggestions apply', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      // Only 1 notification (below threshold of 3 for rule-based suggestions)
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });

      const suggestions = await getSuggestions('user-1');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
});
