// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated bundle title'),
}));

// Mock dependencies used by priority-router (imported transitively)
jest.mock('@/modules/attention/services/attention-budget-service', () => ({
  consumeBudget: jest.fn(),
}));

jest.mock('@/modules/attention/services/dnd-service', () => ({
  isDNDActive: jest.fn().mockResolvedValue(false),
  checkVIPBreakthrough: jest.fn().mockResolvedValue(false),
}));

import {
  bundleNotifications,
  getDigest,
  getWeeklyReview,
  bundleByPriority,
} from '@/modules/attention/services/notification-bundler';
import { notificationStore } from '@/modules/attention/services/priority-router';
import type { NotificationItem } from '@/modules/attention/types';

const { generateText } = require('@/lib/ai');

function makeNotification(overrides: Partial<NotificationItem> & { id: string }): NotificationItem {
  return {
    userId: 'user-1',
    title: 'Test Notification',
    body: 'Test body',
    source: 'email',
    priority: 'P1',
    routedAction: 'NEXT_DIGEST',
    isRead: false,
    isBundled: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('NotificationBundler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationStore.clear();
    generateText.mockResolvedValue('AI-generated bundle title');
  });

  describe('bundleNotifications', () => {
    it('should bundle unread, unbundled, non-P0 notifications by source', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'email', priority: 'P1' }));
      notificationStore.set('n3', makeNotification({ id: 'n3', source: 'slack', priority: 'P2' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles).toHaveLength(2);
      const emailBundle = bundles.find((b) => b.items[0].source === 'email');
      const slackBundle = bundles.find((b) => b.items[0].source === 'slack');
      expect(emailBundle).toBeDefined();
      expect(emailBundle!.itemCount).toBe(2);
      expect(slackBundle).toBeDefined();
      expect(slackBundle!.itemCount).toBe(1);
    });

    it('should exclude P0 priority notifications from bundles', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', priority: 'P0', source: 'alerts' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', priority: 'P1', source: 'email' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles).toHaveLength(1);
      expect(bundles[0].items[0].source).toBe('email');
    });

    it('should exclude already-read notifications', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', isRead: true, source: 'email' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', isRead: false, source: 'email' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles).toHaveLength(1);
      expect(bundles[0].itemCount).toBe(1);
    });

    it('should exclude already-bundled notifications', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', isBundled: true, source: 'email' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', isBundled: false, source: 'email' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles).toHaveLength(1);
      expect(bundles[0].itemCount).toBe(1);
    });

    it('should only include notifications for the specified user', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', userId: 'user-1', source: 'email' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', userId: 'user-2', source: 'email' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles).toHaveLength(1);
      expect(bundles[0].userId).toBe('user-1');
      expect(bundles[0].itemCount).toBe(1);
    });

    it('should mark bundled items with isBundled=true and bundleId', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email' }));

      const bundles = await bundleNotifications('user-1');

      const item = notificationStore.get('n1')!;
      expect(item.isBundled).toBe(true);
      expect(item.bundleId).toBe(bundles[0].id);
    });

    it('should set highest priority to P1 when any item is P1', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'email', priority: 'P2' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles[0].priority).toBe('P1');
    });

    it('should set priority to P2 when all items are P2', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P2' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'email', priority: 'P2' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles[0].priority).toBe('P2');
    });

    it('should use AI-generated title when AI succeeds', async () => {
      generateText.mockResolvedValueOnce('2 email messages about project updates');

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', title: 'Project Update 1' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'email', title: 'Project Update 2' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles[0].title).toBe('2 email messages about project updates');
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('should fall back to generic title when AI fails', async () => {
      generateText.mockRejectedValueOnce(new Error('AI unavailable'));

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'email' }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles[0].title).toBe('2 new email notifications');
    });

    it('should return empty array when no eligible notifications exist', async () => {
      const bundles = await bundleNotifications('user-1');

      expect(bundles).toHaveLength(0);
    });

    it('should sort items within bundle by createdAt descending', async () => {
      const olderDate = new Date('2026-01-01');
      const newerDate = new Date('2026-02-01');

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', createdAt: olderDate }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'email', createdAt: newerDate }));

      const bundles = await bundleNotifications('user-1');

      expect(bundles[0].items[0].createdAt.getTime()).toBeGreaterThan(
        bundles[0].items[1].createdAt.getTime()
      );
    });
  });

  describe('getDigest', () => {
    it('should return only P1 bundles with AI-generated summary', async () => {
      // First call: bundle title for email source, second: bundle title for slack source,
      // third: digest summary
      generateText
        .mockResolvedValueOnce('AI title for email bundle')
        .mockResolvedValueOnce('AI title for slack bundle')
        .mockResolvedValueOnce('AI digest summary paragraph');

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'slack', priority: 'P2' }));

      const digest = await getDigest('user-1');

      expect(digest.bundles).toHaveLength(1);
      expect(digest.bundles[0].priority).toBe('P1');
      expect(digest.summary).toBe('AI digest summary paragraph');
    });

    it('should use fallback summary when AI fails for digest', async () => {
      // First call succeeds (bundle title), second call fails (digest summary)
      generateText
        .mockResolvedValueOnce('AI bundle title')
        .mockRejectedValueOnce(new Error('AI unavailable'));

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));

      const digest = await getDigest('user-1');

      expect(digest.summary).toContain('1 notification bundle');
      expect(digest.summary).toContain('to review');
    });

    it('should return empty bundles when no P1 notifications exist', async () => {
      // First call: bundle title for P2 email source, second: digest summary (always called)
      generateText
        .mockResolvedValueOnce('AI bundle title')
        .mockResolvedValueOnce('No urgent items to review.');

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P2' }));

      const digest = await getDigest('user-1');

      expect(digest.bundles).toHaveLength(0);
      // generateText succeeds, so the AI summary replaces the fallback
      expect(digest.summary).toBe('No urgent items to review.');
    });

    it('should use fallback summary with correct count when AI fails and no P1 bundles', async () => {
      // All generateText calls fail
      generateText.mockRejectedValue(new Error('AI unavailable'));

      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P2' }));

      const digest = await getDigest('user-1');

      expect(digest.bundles).toHaveLength(0);
      expect(digest.summary).toContain('0 notification bundles');
      expect(digest.summary).toContain('to review');
    });
  });

  describe('getWeeklyReview', () => {
    it('should return only P2 bundles', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'slack', priority: 'P2' }));

      const review = await getWeeklyReview('user-1');

      expect(review).toHaveLength(1);
      expect(review[0].priority).toBe('P2');
    });

    it('should return empty array when no P2 notifications exist', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));

      const review = await getWeeklyReview('user-1');

      expect(review).toHaveLength(0);
    });
  });

  describe('bundleByPriority', () => {
    it('should categorize P1 bundles as high', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));

      const result = await bundleByPriority('user-1');

      expect(result.high).toHaveLength(1);
      expect(result.urgent).toHaveLength(0);
      expect(result.low).toHaveLength(0);
    });

    it('should categorize P2 bundles as low', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P2' }));

      const result = await bundleByPriority('user-1');

      expect(result.low).toHaveLength(1);
      expect(result.high).toHaveLength(0);
      expect(result.urgent).toHaveLength(0);
    });

    it('should return all empty categories when no notifications exist', async () => {
      const result = await bundleByPriority('user-1');

      expect(result.urgent).toHaveLength(0);
      expect(result.high).toHaveLength(0);
      expect(result.normal).toHaveLength(0);
      expect(result.low).toHaveLength(0);
    });

    it('should correctly distribute bundles across multiple priority categories', async () => {
      notificationStore.set('n1', makeNotification({ id: 'n1', source: 'email', priority: 'P1' }));
      notificationStore.set('n2', makeNotification({ id: 'n2', source: 'slack', priority: 'P2' }));
      notificationStore.set('n3', makeNotification({ id: 'n3', source: 'github', priority: 'P1' }));

      const result = await bundleByPriority('user-1');

      expect(result.high).toHaveLength(2);
      expect(result.low).toHaveLength(1);
    });
  });
});
