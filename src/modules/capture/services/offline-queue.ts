// ============================================================================
// Offline Capture Queue — Redis/BullMQ Backed
// Stores captures created while offline and replays them on reconnection.
// Uses BullMQ for persistent queue storage with automatic retry and dead-letter.
//
// Falls back to in-memory storage temporarily when Redis is unavailable,
// then drains in-memory items back to Redis once the connection recovers.
// ============================================================================

import { Queue, type JobsOptions } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getRedisUrl } from '@/lib/queue/connection';
import type { CaptureItem } from '@/modules/capture/types';

const QUEUE_NAME = 'capture-queue';
const MAX_RETRIES = 3;

type CreateCaptureParams = Omit<CaptureItem, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

interface OfflineQueueItem extends CaptureItem {
  retryCount: number;
}

// Default job options matching the workflow-queue pattern
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: MAX_RETRIES,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: false, // keep failed jobs so we can treat them as dead-letter items
};

class OfflineQueue {
  private bullQueue: Queue | null = null;
  private redisAvailable = true;

  // In-memory fallback when Redis is down
  private fallbackQueue: OfflineQueueItem[] = [];
  private fallbackDeadLetter: OfflineQueueItem[] = [];

  private maxRetries = MAX_RETRIES;
  private lastSyncAttempt?: Date;
  private processorFn?: (item: CaptureItem) => Promise<CaptureItem>;

  /**
   * Lazily initialize the BullMQ Queue, reusing the shared Redis URL.
   * If Redis is unavailable, marks redisAvailable = false and returns null,
   * ensuring in-memory fallback will be used for all queue operations.
   */
  private getBullQueue(): Queue | null {
    if (this.bullQueue) return this.bullQueue;

    try {
      const redisUrl = getRedisUrl();
      if (!redisUrl) {
        this.redisAvailable = false;
        return null;
      }

      this.bullQueue = new Queue(QUEUE_NAME, {
        connection: { url: redisUrl },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });

      // Listen for connection errors to trigger fallback mode
      this.bullQueue.on('error', () => {
        this.redisAvailable = false;
      });

      this.redisAvailable = true;
      return this.bullQueue;
    } catch {
      // Redis unavailable — all operations will use the in-memory fallback queue.
      // Items stored in-memory are drained back to Redis via drainFallbackToRedis()
      // when the connection recovers during a flush() call.
      this.redisAvailable = false;
      return null;
    }
  }

  /**
   * Set the processor function used by syncQueue/flush and dequeue.
   */
  setProcessor(fn: (item: CaptureItem) => Promise<CaptureItem>): void {
    this.processorFn = fn;
  }

  /**
   * Add a capture item to the persistent queue.
   * Falls back to in-memory if Redis is unavailable.
   */
  async enqueue(params: CreateCaptureParams): Promise<string> {
    const now = new Date();
    const id = uuidv4();

    const item: OfflineQueueItem = {
      id,
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

    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        await q.add('capture-item', item, {
          jobId: `capture-${id}`,
        });
        return id;
      } catch {
        // Redis write failed — fall back to in-memory
        this.redisAvailable = false;
      }
    }

    // Fallback: store in memory
    this.fallbackQueue.push(item);
    return id;
  }

  /**
   * Legacy synchronous enqueue — kept for backward compatibility.
   * Attempts Redis, falls back to in-memory on failure.
   */
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

    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      // Fire-and-forget add to Redis. On failure, push to fallback.
      q.add('capture-item', item, { jobId: `capture-${item.id}` }).catch(() => {
        this.redisAvailable = false;
        this.fallbackQueue.push(item);
      });
    } else {
      this.fallbackQueue.push(item);
    }
  }

  /**
   * Process the next pending item from the queue.
   * Returns the processed item, or null if the queue is empty or no processor set.
   */
  async dequeue(): Promise<CaptureItem | null> {
    if (!this.processorFn) return null;

    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        // Get the next waiting job
        const [nextJob] = await q.getJobs(['waiting'], 0, 0, true);
        if (!nextJob) {
          // Nothing in Redis — check fallback
          return this.dequeueFallback();
        }

        const item = nextJob.data as OfflineQueueItem;
        try {
          const result = await this.processorFn(item);
          item.syncedAt = new Date();
          await nextJob.remove();
          return result;
        } catch {
          item.retryCount++;
          item.updatedAt = new Date();
          await nextJob.updateData({ ...item });
          if (item.retryCount >= this.maxRetries) {
            item.status = 'FAILED';
            await nextJob.moveToFailed(
              new Error('Max retries exceeded'),
              'capture-processor',
            );
          }
          // Return the item with updated status so the caller has
          // visibility into what failed rather than getting a silent null.
          return {
            ...item,
            status: item.retryCount >= this.maxRetries ? 'FAILED' : 'PENDING',
          } as CaptureItem;
        }
      } catch {
        this.redisAvailable = false;
      }
    }

    return this.dequeueFallback();
  }

  /**
   * Process the next item from the in-memory fallback queue.
   */
  private async dequeueFallback(): Promise<CaptureItem | null> {
    if (!this.processorFn || this.fallbackQueue.length === 0) return null;

    const item = this.fallbackQueue[0];
    try {
      const result = await this.processorFn(item);
      item.syncedAt = new Date();
      this.fallbackQueue.shift();
      return result;
    } catch {
      item.retryCount++;
      item.updatedAt = new Date();
      if (item.retryCount >= this.maxRetries) {
        item.status = 'FAILED';
        this.fallbackQueue.shift();
        this.fallbackDeadLetter.push(item);
      }
      // Return the item with updated status so callers have
      // visibility into what failed rather than getting a silent null.
      return {
        ...item,
        status: item.retryCount >= this.maxRetries ? 'FAILED' : 'PENDING',
      } as CaptureItem;
    }
  }

  /**
   * Get the total count of pending items across Redis and in-memory fallback.
   */
  async getQueueSize(): Promise<number> {
    let redisCount = 0;
    const q = this.getBullQueue();

    if (q && this.redisAvailable) {
      try {
        const counts = await q.getJobCounts('waiting', 'delayed', 'active');
        redisCount = counts.waiting + counts.delayed + counts.active;
      } catch {
        this.redisAvailable = false;
      }
    }

    return redisCount + this.fallbackQueue.length;
  }

  /**
   * Retrieve items from the dead-letter store (failed BullMQ jobs + in-memory dead-letter).
   */
  async getDeadLetterItems(): Promise<CaptureItem[]> {
    const items: CaptureItem[] = [...this.fallbackDeadLetter];

    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        const failedJobs = await q.getJobs(['failed']);
        for (const job of failedJobs) {
          items.push(job.data as CaptureItem);
        }
      } catch {
        this.redisAvailable = false;
      }
    }

    return items;
  }

  /**
   * Retry a specific dead-letter item by its ID.
   * Re-adds it to the queue with a reset retry count.
   */
  async retryDeadLetter(itemId: string): Promise<boolean> {
    // Check in-memory dead-letter first
    const fallbackIdx = this.fallbackDeadLetter.findIndex((i) => i.id === itemId);
    if (fallbackIdx !== -1) {
      const [item] = this.fallbackDeadLetter.splice(fallbackIdx, 1);
      item.retryCount = 0;
      item.status = 'PENDING';
      item.updatedAt = new Date();

      const q = this.getBullQueue();
      if (q && this.redisAvailable) {
        try {
          await q.add('capture-item', item, { jobId: `capture-${item.id}-retry` });
          return true;
        } catch {
          this.redisAvailable = false;
        }
      }
      // Fallback: put back in memory queue
      this.fallbackQueue.push(item);
      return true;
    }

    // Check BullMQ failed jobs
    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        const failedJobs = await q.getJobs(['failed']);
        const job = failedJobs.find((j) => {
          const data = j.data as OfflineQueueItem;
          return data.id === itemId;
        });

        if (job) {
          await job.retry('failed');
          return true;
        }
      } catch {
        this.redisAvailable = false;
      }
    }

    return false;
  }

  /**
   * Process all pending items in the queue (both Redis and in-memory).
   * This is the main "flush" operation equivalent to the old syncQueue behavior.
   */
  async flush(): Promise<{ synced: number; failed: number }> {
    this.lastSyncAttempt = new Date();

    if (!this.processorFn) {
      const size = await this.getQueueSize();
      return { synced: 0, failed: size };
    }

    let synced = 0;
    let failed = 0;

    // First, drain any in-memory fallback items back to Redis if available
    await this.drainFallbackToRedis();

    // Process BullMQ jobs
    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        const jobs = await q.getJobs(['waiting', 'delayed'], 0, -1, true);

        for (const job of jobs) {
          const item = job.data as OfflineQueueItem;
          try {
            await this.processorFn(item);
            item.syncedAt = new Date();
            await job.remove();
            synced++;
          } catch {
            item.retryCount = (item.retryCount ?? 0) + 1;
            await job.updateData({ ...item });

            if (item.retryCount >= this.maxRetries) {
              await job.moveToFailed(
                new Error('Max retries exceeded'),
                'capture-processor',
              );
            }
            failed++;
          }
        }
      } catch {
        this.redisAvailable = false;
      }
    }

    // Process remaining in-memory fallback items
    const remaining: OfflineQueueItem[] = [];
    for (const item of this.fallbackQueue) {
      if (item.retryCount >= this.maxRetries) {
        this.fallbackDeadLetter.push(item);
        failed++;
        continue;
      }

      try {
        await this.processorFn(item);
        item.syncedAt = new Date();
        synced++;
      } catch {
        item.retryCount++;
        if (item.retryCount >= this.maxRetries) {
          this.fallbackDeadLetter.push(item);
        } else {
          remaining.push(item);
        }
        failed++;
      }
    }
    this.fallbackQueue = remaining;

    return { synced, failed };
  }

  /**
   * Backward-compatible alias for flush().
   */
  async syncQueue(): Promise<{ synced: number; failed: number }> {
    return this.flush();
  }

  /**
   * Get all queued items (pending) from both Redis and in-memory fallback.
   */
  async getQueuedItems(): Promise<CaptureItem[]> {
    const items: CaptureItem[] = [...this.fallbackQueue];

    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        const jobs = await q.getJobs(['waiting', 'delayed', 'active']);
        for (const job of jobs) {
          items.push(job.data as CaptureItem);
        }
      } catch {
        this.redisAvailable = false;
      }
    }

    return items;
  }

  /**
   * Clear all items from both Redis queue and in-memory fallback.
   */
  async clearQueue(): Promise<void> {
    this.fallbackQueue = [];
    this.fallbackDeadLetter = [];

    const q = this.getBullQueue();
    if (q && this.redisAvailable) {
      try {
        await q.obliterate({ force: true });
      } catch {
        this.redisAvailable = false;
      }
    }
  }

  getLastSyncAttempt(): Date | undefined {
    return this.lastSyncAttempt;
  }

  /**
   * Check whether Redis is currently available.
   */
  isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  /**
   * Get the count of items in the in-memory fallback queue.
   */
  getFallbackQueueSize(): number {
    return this.fallbackQueue.length;
  }

  /**
   * Attempt to move in-memory fallback items into the Redis queue.
   * Called automatically during flush() when Redis recovers.
   */
  private async drainFallbackToRedis(): Promise<void> {
    if (this.fallbackQueue.length === 0) return;

    const q = this.getBullQueue();
    if (!q || !this.redisAvailable) return;

    const drained: number[] = [];
    for (let i = 0; i < this.fallbackQueue.length; i++) {
      const item = this.fallbackQueue[i];
      try {
        await q.add('capture-item', item, {
          jobId: `capture-${item.id}`,
        });
        drained.push(i);
      } catch {
        this.redisAvailable = false;
        break;
      }
    }

    // Remove drained items in reverse order to keep indices valid
    for (let i = drained.length - 1; i >= 0; i--) {
      this.fallbackQueue.splice(drained[i], 1);
    }
  }

  /**
   * Gracefully close the BullMQ queue connection.
   */
  async close(): Promise<void> {
    if (this.bullQueue) {
      await this.bullQueue.close();
      this.bullQueue = null;
    }
  }
}

export const offlineQueue = new OfflineQueue();
export { OfflineQueue };
