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
});

describe('bundleNotifications', () => {
  it('should group notifications by source', async () => {
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'slack', priority: 'P1' });

    const bundles = await bundleNotifications('user-1');
    expect(bundles.length).toBe(2);
    const emailBundle = bundles.find((b) => b.title.includes('email'));
    expect(emailBundle?.itemCount).toBe(2);
  });

  it('should only bundle unread items', async () => {
    addNotification({ source: 'email', priority: 'P1', isRead: false });
    addNotification({ source: 'email', priority: 'P1', isRead: true });

    const bundles = await bundleNotifications('user-1');
    const emailBundle = bundles.find((b) => b.title.includes('email'));
    expect(emailBundle?.itemCount).toBe(1);
  });

  it('should calculate correct item counts', async () => {
    addNotification({ source: 'slack', priority: 'P1' });
    addNotification({ source: 'slack', priority: 'P1' });
    addNotification({ source: 'slack', priority: 'P2' });

    const bundles = await bundleNotifications('user-1');
    const slackBundle = bundles.find((b) => b.title.includes('slack'));
    expect(slackBundle?.itemCount).toBe(3);
  });

  it('should not bundle P0 items', async () => {
    addNotification({ source: 'urgent', priority: 'P0' });
    addNotification({ source: 'email', priority: 'P1' });

    const bundles = await bundleNotifications('user-1');
    const urgentBundle = bundles.find((b) => b.title.includes('urgent'));
    expect(urgentBundle).toBeUndefined();
  });
});

describe('getDigest', () => {
  it('should return P1 bundles only', async () => {
    addNotification({ source: 'email', priority: 'P1' });
    addNotification({ source: 'newsletter', priority: 'P2' });

    const digest = await getDigest('user-1');
    expect(digest.every((b) => b.priority === 'P1')).toBe(true);
  });

  it('should sort by priority then recency', async () => {
    addNotification({ source: 'email', priority: 'P1', createdAt: new Date('2026-01-01') });
    addNotification({ source: 'slack', priority: 'P1', createdAt: new Date('2026-02-01') });

    const digest = await getDigest('user-1');
    if (digest.length >= 2) {
      expect(digest[0].createdAt.getTime()).toBeGreaterThanOrEqual(digest[1].createdAt.getTime());
    }
  });
});
