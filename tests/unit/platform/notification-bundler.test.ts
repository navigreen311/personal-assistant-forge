import { bundleNotifications, getDigest, getWeeklyReview } from '@/modules/attention/services/notification-bundler';
import { notificationStore } from '@/modules/attention/services/priority-router';
import type { NotificationItem } from '@/modules/attention/types';

// Mock priority-router to expose notificationStore
jest.mock('@/modules/attention/services/priority-router', () => {
  const store = new Map();
  return {
    notificationStore: store,
  };
});

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated bundle title'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI response'),
}));

function addNotification(overrides: Partial<NotificationItem>): NotificationItem {
  const item: NotificationItem = {
    id: `notif-${Math.random().toString(36).slice(2)}`,
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
  notificationStore.set(item.id, item);
  return item;
}

beforeEach(() => {
  notificationStore.clear();
  jest.clearAllMocks();
});

describe('bundleNotifications (AI-enhanced)', () => {
  const { generateText } = jest.requireMock('@/lib/ai');

  it('should group notifications by source', async () => {
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'slack', priority: 'P1' });

    const bundles = await bundleNotifications('user-1');
    expect(bundles.length).toBe(2);
  });

  it('should call generateText for intelligent bundle titles', async () => {
    addNotification({ source: 'email', priority: 'P1', title: 'Project update' });
    addNotification({ source: 'email', priority: 'P1', title: 'Budget review' });

    await bundleNotifications('user-1');
    expect(generateText).toHaveBeenCalled();
  });

  it('should include notification content in prompt', async () => {
    addNotification({ source: 'slack', priority: 'P1', title: 'Deploy complete' });

    await bundleNotifications('user-1');
    const callArgs = (generateText as jest.Mock).mock.calls[0][0];
    expect(callArgs).toContain('Deploy complete');
  });

  it('should fall back to generic titles if AI fails', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('AI failed'));
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'email', priority: 'P1' });

    const bundles = await bundleNotifications('user-1');
    expect(bundles[0].title).toContain('email');
    expect(bundles[0].title).toContain('2');
  });

  it('should only bundle unread items', async () => {
    addNotification({ source: 'email', priority: 'P1', isRead: false });
    addNotification({ source: 'email', priority: 'P1', isRead: true });

    const bundles = await bundleNotifications('user-1');
    const emailBundle = bundles.find((b) => b.itemCount > 0);
    expect(emailBundle?.itemCount).toBe(1);
  });

  it('should calculate correct item counts', async () => {
    addNotification({ source: 'slack', priority: 'P1' });
    addNotification({ source: 'slack', priority: 'P1' });
    addNotification({ source: 'slack', priority: 'P2' });

    const bundles = await bundleNotifications('user-1');
    const slackBundle = bundles.find((b) => b.itemCount === 3);
    expect(slackBundle).toBeDefined();
  });

  it('should not bundle P0 items', async () => {
    addNotification({ source: 'urgent', priority: 'P0' });
    addNotification({ source: 'email', priority: 'P1' });

    const bundles = await bundleNotifications('user-1');
    expect(bundles.length).toBe(1);
  });
});

describe('getDigest', () => {
  it('should return P1 bundles only', async () => {
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'newsletter', priority: 'P2' });

    const result = await getDigest('user-1');
    expect(result.bundles.every((b) => b.priority === 'P1')).toBe(true);
  });

  it('should include a summary paragraph', async () => {
    addNotification({ source: 'email', priority: 'P1' });

    const result = await getDigest('user-1');
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe('string');
  });

  it('should sort by recency', async () => {
    addNotification({ source: 'email', priority: 'P1', createdAt: new Date('2026-01-01') });
    addNotification({ source: 'slack', priority: 'P1', createdAt: new Date('2026-02-01') });

    const result = await getDigest('user-1');
    if (result.bundles.length >= 2) {
      expect(result.bundles[0].createdAt.getTime()).toBeGreaterThanOrEqual(result.bundles[1].createdAt.getTime());
    }
  });
});
