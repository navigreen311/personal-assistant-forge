// ============================================================================
// Offline Capture Queue
// Stores captures created while offline and replays them on reconnection.
// Includes dead-letter queue for items exceeding max retries.
//
// Storage: In-memory array for development.
// Production: IndexedDB (client-side) or Redis (server-side) for persistence.
//
// Client-side integration:
//   const db = await openDB('paf-capture', 1, {
//     upgrade(db) { db.createObjectStore('offline-queue', { keyPath: 'id' }); }
//   });
//
// Server-side integration:
//   await redis.lpush('offline-queue:userId', JSON.stringify(capture));
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { CaptureItem, CaptureSource, CaptureContentType, CaptureMetadata } from '@/modules/capture/types';

interface OfflineQueueItem extends CaptureItem {
  retryCount: number;
}

type CreateCaptureParams = Omit<CaptureItem, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

class OfflineQueue {
  private queue: OfflineQueueItem[] = [];
  private deadLetterQueue: OfflineQueueItem[] = [];
  private maxRetries = 3;
  private lastSyncAttempt?: Date;
  private processorFn?: (item: CaptureItem) => Promise<CaptureItem>;

  setProcessor(fn: (item: CaptureItem) => Promise<CaptureItem>): void {
    this.processorFn = fn;
  }

  enqueueOfflineCapture(params: CreateCaptureParams): void {
    const now = new Date();
    const item: OfflineQueueItem = {
      id: uuidv4(),
      userId: params.userId,
      entityId: params.entityId,
      source: params.source,
      contentType: params.contentType,
      rawContent: params.rawContent,
      processedContent: params.processedContent,
      metadata: params.metadata ?? {},
      routingResult: params.routingResult,
      status: 'PENDING',
      offlineCreatedAt: params.offlineCreatedAt ?? now,
      syncedAt: undefined,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
    };

    this.queue.push(item);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getQueuedItems(): CaptureItem[] {
    return [...this.queue];
  }

  getDeadLetterItems(): CaptureItem[] {
    return [...this.deadLetterQueue];
  }

  async syncQueue(): Promise<{ synced: number; failed: number }> {
    this.lastSyncAttempt = new Date();

    if (!this.processorFn) {
      // No processor — can't sync. All items remain in queue.
      return { synced: 0, failed: this.queue.length };
    }

    let synced = 0;
    let failed = 0;
    const remaining: OfflineQueueItem[] = [];

    for (const item of this.queue) {
      // Check if item has exceeded max retries
      if (item.retryCount >= this.maxRetries) {
        this.deadLetterQueue.push(item);
        failed++;
        continue;
      }

      try {
        await this.processorFn(item);
        item.syncedAt = new Date();
        synced++;
      } catch {
        item.retryCount++;
        remaining.push(item);
        failed++;
      }
    }

    this.queue = remaining;
    return { synced, failed };
  }

  clearQueue(): void {
    this.queue = [];
  }

  getLastSyncAttempt(): Date | undefined {
    return this.lastSyncAttempt;
  }
}

export const offlineQueue = new OfflineQueue();
export { OfflineQueue };
