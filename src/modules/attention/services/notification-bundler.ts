import { v4 as uuidv4 } from 'uuid';
import { generateText } from '@/lib/ai';
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
    let bundleTitle = `${sourceItems.length} new ${source} notification${sourceItems.length > 1 ? 's' : ''}`;
    try {
      const itemSummaries = sourceItems.map((i) => `"${i.title}"`).join(', ');
      bundleTitle = await generateText(
        `Create a concise bundle title summarizing these ${sourceItems.length} ${source} notifications: ${itemSummaries}. Format: "${sourceItems.length} ${source} messages about [topic]". Keep it under 80 characters.`,
        { temperature: 0.5, maxTokens: 64 }
      );
    } catch {
      // Keep generic title on failure
    }

    const bundle: NotificationBundle = {
      id: uuidv4(),
      userId,
      title: bundleTitle,
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

export async function getDigest(userId: string): Promise<{ summary: string; bundles: NotificationBundle[] }> {
  const bundles = await bundleNotifications(userId);
  const p1Bundles = bundles
    .filter((b) => b.priority === 'P1')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let summary = `You have ${p1Bundles.length} notification bundle${p1Bundles.length !== 1 ? 's' : ''} to review.`;
  try {
    const bundleSummaries = p1Bundles.map((b) => `- ${b.title} (${b.itemCount} items)`).join('\n');
    summary = await generateText(
      `Write a brief digest summary paragraph (2-3 sentences) for these notification bundles:\n${bundleSummaries}\n\nSummarize the key themes and what requires attention.`,
      { temperature: 0.5, maxTokens: 150 }
    );
  } catch {
    // Keep fallback summary
  }

  return { summary, bundles: p1Bundles };
}

export async function getWeeklyReview(userId: string): Promise<NotificationBundle[]> {
  const bundles = await bundleNotifications(userId);
  return bundles
    .filter((b) => b.priority === 'P2')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function bundleByPriority(userId: string): Promise<Record<string, NotificationBundle[]>> {
  const bundles = await bundleNotifications(userId);
  const byPriority: Record<string, NotificationBundle[]> = {
    urgent: [],
    high: [],
    normal: [],
    low: [],
  };

  for (const bundle of bundles) {
    if (bundle.priority === 'P0') {
      byPriority.urgent.push(bundle);
    } else if (bundle.priority === 'P1') {
      byPriority.high.push(bundle);
    } else {
      byPriority.low.push(bundle);
    }
  }

  return byPriority;
}
