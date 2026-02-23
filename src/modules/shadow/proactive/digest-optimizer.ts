import { prisma } from '@/lib/db';

// ---- Types ----

export interface DigestItem {
  type: string;
  title: string;
  priority: string;
  deadline?: Date;
  content: string;
  addedAt: Date;
}

export interface DigestOutput {
  items: DigestItem[];
  summary: string;
}

// ---- Constants ----

/** Items with these priorities should never be batched; they need immediate delivery. */
const IMMEDIATE_PRIORITIES = new Set(['P0']);

/** Items with deadlines less than this many hours away should not be batched. */
const DEADLINE_THRESHOLD_HOURS = 4;

/** Priority sort order for digest items. */
const PRIORITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  low: 4,
};

// ---- Service ----

export class DigestOptimizer {
  /**
   * Add an item to the user's pending digest.
   * If the item should not be batched (P0, or deadline < 4 hours), it is still added
   * but the caller should check shouldBatchItem() to decide whether to batch or deliver immediately.
   */
  async addToDigest(
    userId: string,
    item: {
      type: string;
      title: string;
      priority: string;
      deadline?: Date;
      content: string;
    }
  ): Promise<void> {
    // Store as a notification-like record with digest metadata
    await prisma.shadowOutreach.create({
      data: {
        userId,
        triggerType: `digest_${item.type}`,
        channel: 'digest',
        status: 'pending_digest',
        content: JSON.stringify({
          type: item.type,
          title: item.title,
          priority: item.priority,
          deadline: item.deadline?.toISOString() ?? null,
          content: item.content,
          addedAt: new Date().toISOString(),
        }),
      },
    });
  }

  /**
   * Generate a digest from all pending digest items for a user.
   * Filters out items that should not have been batched (P0, <4hr deadline).
   * Returns the items grouped and summarized.
   */
  async generateDigest(userId: string): Promise<DigestOutput> {
    // Fetch all pending digest items
    const pendingRecords = await prisma.shadowOutreach.findMany({
      where: {
        userId,
        channel: 'digest',
        status: 'pending_digest',
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const items: DigestItem[] = [];

    for (const record of pendingRecords) {
      try {
        const parsed = JSON.parse(record.content ?? '{}');
        const deadline = parsed.deadline ? new Date(parsed.deadline) : undefined;
        const priority = parsed.priority ?? 'P2';

        // Skip items that should not be in digest (P0 or imminent deadline)
        if (IMMEDIATE_PRIORITIES.has(priority)) continue;
        if (deadline) {
          const hoursUntil = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
          if (hoursUntil < DEADLINE_THRESHOLD_HOURS) continue;
        }

        items.push({
          type: parsed.type ?? 'unknown',
          title: parsed.title ?? 'Untitled',
          priority,
          deadline,
          content: parsed.content ?? '',
          addedAt: new Date(parsed.addedAt ?? record.createdAt),
        });
      } catch {
        // Skip malformed records
        continue;
      }
    }

    // Sort by priority then by addedAt
    items.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 5;
      const pb = PRIORITY_ORDER[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      return a.addedAt.getTime() - b.addedAt.getTime();
    });

    // Mark processed items as delivered
    const pendingIds = pendingRecords.map((r) => r.id);
    if (pendingIds.length > 0) {
      await prisma.shadowOutreach.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: 'digest_delivered' },
      });
    }

    // Build summary
    const summary = this.buildDigestSummary(items);

    return { items, summary };
  }

  /**
   * Determine whether an item should be batched into a digest.
   *
   * Rules:
   * - P0 items are NEVER batched (require immediate delivery).
   * - Items with deadline < 4 hours away are NOT batched.
   * - Everything else can be batched.
   */
  shouldBatchItem(item: { priority: string; deadline?: Date }): boolean {
    // P0 items always need immediate delivery
    if (IMMEDIATE_PRIORITIES.has(item.priority)) {
      return false;
    }

    // Items with imminent deadlines need immediate delivery
    if (item.deadline) {
      const now = new Date();
      const hoursUntil = (item.deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hoursUntil < DEADLINE_THRESHOLD_HOURS) {
        return false;
      }
    }

    return true;
  }

  /**
   * Build a natural language summary of digest items.
   */
  private buildDigestSummary(items: DigestItem[]): string {
    if (items.length === 0) {
      return 'No items in your digest. Everything looks clear.';
    }

    const parts: string[] = [];
    parts.push(`Your digest contains ${items.length} item${items.length !== 1 ? 's' : ''}.`);

    // Group by type
    const byType = new Map<string, DigestItem[]>();
    for (const item of items) {
      const existing = byType.get(item.type) ?? [];
      existing.push(item);
      byType.set(item.type, existing);
    }

    byType.forEach((typeItems, type) => {
      const label = this.humanizeType(type);
      if (typeItems.length === 1) {
        parts.push(`${typeItems.length} ${label}: ${typeItems[0].title}.`);
      } else {
        parts.push(`${typeItems.length} ${label} items.`);
      }
    });

    // Highlight any with deadlines
    const withDeadlines = items.filter((i) => i.deadline);
    if (withDeadlines.length > 0) {
      const soonest = withDeadlines.sort(
        (a, b) => (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0)
      )[0];
      if (soonest.deadline) {
        const hoursUntil = Math.round(
          (soonest.deadline.getTime() - Date.now()) / (60 * 60 * 1000)
        );
        parts.push(
          `Earliest deadline: "${soonest.title}" in ${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}.`
        );
      }
    }

    return parts.join(' ');
  }

  /**
   * Convert internal type strings to human-readable labels.
   */
  private humanizeType(type: string): string {
    const map: Record<string, string> = {
      task: 'task',
      message: 'message',
      invoice: 'invoice',
      workflow: 'workflow update',
      calendar: 'calendar update',
      contact: 'contact update',
    };
    return map[type] ?? type;
  }
}

export const digestOptimizer = new DigestOptimizer();
