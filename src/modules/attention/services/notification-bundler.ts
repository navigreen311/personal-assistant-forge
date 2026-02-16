import { v4 as uuidv4 } from 'uuid';
import type { NotificationBundle, NotificationItem } from '../types';
import { notificationStore } from './priority-router';

export async function bundleNotifications(userId: string): Promise<NotificationBundle[]> {
  const items: NotificationItem[] = [];
  for (const item of notificationStore.values()) {
    if (item.userId === userId && !item.isRead && !item.isBundled && item.priority !== 'P0') {
      items.push(item);
    }
  }

  const bySource = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const existing = bySource.get(item.source) || [];
    existing.push(item);
    bySource.set(item.source, existing);
  }

  const bundles: NotificationBundle[] = [];
  for (const [source, sourceItems] of bySource.entries()) {
    const highestPriority = sourceItems.some((i) => i.priority === 'P1') ? 'P1' as const : 'P2' as const;
    const bundle: NotificationBundle = {
      id: uuidv4(),
      userId,
      title: `${sourceItems.length} new ${source} notification${sourceItems.length > 1 ? 's' : ''}`,
      itemCount: sourceItems.length,
      items: sourceItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      priority: highestPriority,
      createdAt: new Date(),
    };

    for (const item of sourceItems) {
      item.isBundled = true;
      item.bundleId = bundle.id;
    }

    bundles.push(bundle);
  }

  return bundles;
}

export async function getDigest(userId: string): Promise<NotificationBundle[]> {
  const bundles = await bundleNotifications(userId);
  return bundles
    .filter((b) => b.priority === 'P1')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getWeeklyReview(userId: string): Promise<NotificationBundle[]> {
  const bundles = await bundleNotifications(userId);
  return bundles
    .filter((b) => b.priority === 'P2')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
