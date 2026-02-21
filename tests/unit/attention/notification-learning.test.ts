import {
  analyzePatterns,
  getSuggestions,
  recordAction,
  getPreferences,
  suggestPriority,
  getInsights,
} from '@/modules/attention/services/notification-learning-service';
import { notificationStore } from '@/modules/attention/services/priority-router';

// Mock DB
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

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
const { prisma } = require('@/lib/db');

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

  describe('recordAction', () => {
    it('should mark notification as read when action is "read"', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });

      await recordAction('user-1', 'n1', 'read');

      const notification = notificationStore.get('n1');
      expect(notification!.isRead).toBe(true);
    });

    it('should not mark notification as read for non-read actions', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });

      await recordAction('user-1', 'n1', 'dismiss');

      const notification = notificationStore.get('n1');
      expect(notification!.isRead).toBe(false);
    });

    it('should log action to ActionLog via prisma', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });

      await recordAction('user-1', 'n1', 'act');

      expect(prisma.actionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'user-1',
            actionType: 'NOTIFICATION_ACTION',
            target: 'n1',
            reason: expect.stringContaining('act'),
          }),
        })
      );
    });

    it('should handle recording action for non-existent notification gracefully', async () => {
      await expect(recordAction('user-1', 'nonexistent', 'read')).resolves.not.toThrow();

      expect(prisma.actionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'user-1',
            target: 'nonexistent',
          }),
        })
      );
    });

    it('should include source in reason when notification exists', async () => {
      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'slack', priority: 'P0' as const, routedAction: 'INTERRUPT' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });

      await recordAction('user-1', 'n1', 'snooze');

      expect(prisma.actionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: expect.stringContaining('slack'),
          }),
        })
      );
    });

    it('should not throw when DB logging fails', async () => {
      (prisma.actionLog.create as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      notificationStore.set('n1', {
        id: 'n1', userId: 'user-1', title: 'T', body: 'B',
        source: 'email', priority: 'P1' as const, routedAction: 'NEXT_DIGEST' as const,
        isRead: false, isBundled: false, createdAt: new Date(),
      });

      await expect(recordAction('user-1', 'n1', 'read')).resolves.not.toThrow();
    });
  });

  describe('getPreferences', () => {
    it('should return default preferences when no action logs exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([]);

      const prefs = await getPreferences('user-1');

      expect(prefs.preferredTimes).toEqual(['09:00']);
      expect(prefs.priorityAccuracy).toBe(0.75);
      expect(prefs.actionRates).toEqual({});
    });

    it('should compute action rates from logs grouped by source', async () => {
      const now = new Date();
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([
        { reason: 'User act notification from email', timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9) },
        { reason: 'User act notification from email', timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10) },
        { reason: 'User dismiss notification from email', timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11) },
        { reason: 'User dismiss notification from slack', timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14) },
      ]);

      const prefs = await getPreferences('user-1');

      expect(prefs.actionRates['email']).toBeDefined();
      expect(prefs.actionRates['email'].total).toBe(3);
      expect(prefs.actionRates['email'].actRate).toBeCloseTo(2 / 3);
      expect(prefs.actionRates['email'].dismissRate).toBeCloseTo(1 / 3);

      expect(prefs.actionRates['slack']).toBeDefined();
      expect(prefs.actionRates['slack'].total).toBe(1);
      expect(prefs.actionRates['slack'].dismissRate).toBe(1);
    });

    it('should identify preferred notification times from log timestamps', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([
        { reason: 'User read notification from email', timestamp: new Date(2026, 1, 20, 9, 0) },
        { reason: 'User read notification from email', timestamp: new Date(2026, 1, 20, 9, 15) },
        { reason: 'User read notification from email', timestamp: new Date(2026, 1, 20, 9, 30) },
        { reason: 'User act notification from email', timestamp: new Date(2026, 1, 20, 14, 0) },
      ]);

      const prefs = await getPreferences('user-1');

      expect(prefs.preferredTimes).toContain('09:00');
    });

    it('should handle DB errors gracefully and return defaults', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockRejectedValueOnce(new Error('DB down'));

      const prefs = await getPreferences('user-1');

      expect(prefs.preferredTimes).toEqual(['09:00']);
      expect(prefs.priorityAccuracy).toBe(0.75);
    });
  });

  describe('suggestPriority', () => {
    it('should suggest P2 for sources with high dismiss rate', async () => {
      // Build logs with high dismiss rate for "newsletter"
      const logs = [];
      for (let i = 0; i < 6; i++) {
        logs.push({ reason: 'User dismiss notification from newsletter', timestamp: new Date(2026, 1, 20, 10) });
      }
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce(logs);

      const result = await suggestPriority('user-1', {
        source: 'newsletter', title: 'Weekly digest', body: 'Content', priority: 'P1',
      });

      expect(result.suggestedPriority).toBe('P2');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('dismiss');
    });

    it('should suggest P0 for sources with high act rate', async () => {
      const logs = [];
      for (let i = 0; i < 6; i++) {
        logs.push({ reason: 'User act notification from alerts', timestamp: new Date(2026, 1, 20, 10) });
      }
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce(logs);

      const result = await suggestPriority('user-1', {
        source: 'alerts', title: 'Server alert', body: 'Down', priority: 'P1',
      });

      expect(result.suggestedPriority).toBe('P0');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reason).toContain('act');
    });

    it('should fall back to AI suggestion when no rule-based match', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([]);
      generateJSON.mockResolvedValueOnce({
        priority: 'P1', confidence: 0.7, reason: 'AI assessment',
      });

      const result = await suggestPriority('user-1', {
        source: 'newSource', title: 'Something', body: 'Body', priority: 'P1',
      });

      expect(result.suggestedPriority).toBe('P1');
      expect(result.reason).toBe('AI assessment');
    });

    it('should return default priority when both rules and AI fail', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([]);
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await suggestPriority('user-1', {
        source: 'unknown', title: 'Test', body: 'Body', priority: 'P1',
      });

      expect(result.suggestedPriority).toBe('P1');
      expect(result.confidence).toBe(0.5);
      expect(result.reason).toBe('Default priority maintained');
    });
  });

  describe('getInsights', () => {
    it('should generate insight for frequently dismissed source', async () => {
      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push({ reason: 'User dismiss notification from marketing', timestamp: new Date(2026, 1, 20, 10) });
      }
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce(logs);

      const insights = await getInsights('user-1');

      expect(insights.some((i: string) => i.includes('marketing'))).toBe(true);
      expect(insights.some((i: string) => i.includes('dismiss') || i.includes('downgrading'))).toBe(true);
    });

    it('should generate insight for high engagement source', async () => {
      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push({ reason: 'User act notification from github', timestamp: new Date(2026, 1, 20, 10) });
      }
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce(logs);

      const insights = await getInsights('user-1');

      expect(insights.some((i: string) => i.includes('github'))).toBe(true);
      expect(insights.some((i: string) => i.includes('engagement') || i.includes('action rate'))).toBe(true);
    });

    it('should include preferred times in insights', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([
        { reason: 'User read notification from email', timestamp: new Date(2026, 1, 20, 9, 0) },
      ]);

      const insights = await getInsights('user-1');

      expect(insights.some((i: string) => i.includes('active notification times'))).toBe(true);
    });

    it('should return default message when no patterns exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([]);

      const insights = await getInsights('user-1');

      // With no action logs, getPreferences returns default preferredTimes ['09:00']
      // so insights will include the preferred times message rather than the fallback.
      // The function still returns at least one insight.
      expect(insights.length).toBeGreaterThan(0);
      expect(insights.some((i: string) =>
        i.includes('active notification times') || i.includes('Continue using')
      )).toBe(true);
    });

    it('should handle DB errors gracefully', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const insights = await getInsights('user-1');

      expect(insights.length).toBeGreaterThan(0);
    });
  });
});
