// ============================================================================
// Capture Queue Processor — BullMQ Worker
// Processes capture items from the persistent capture-queue.
// Handles processing, routing, and marking items as synced.
// ============================================================================

import { Worker, type Job } from 'bullmq';
import { getRedisUrl } from '@/lib/queue/connection';
import { captureService } from '@/modules/capture/services/capture-service';
import type { CaptureItem } from '@/modules/capture/types';

const QUEUE_NAME = 'capture-queue';

interface OfflineQueueItem extends CaptureItem {
  retryCount: number;
}

/**
 * Process a single capture item from the queue.
 * Creates a capture via captureService, then processes and routes it.
 */
async function processCaptureJob(job: Job<OfflineQueueItem>): Promise<void> {
  const item = job.data;

  // Create the capture in the main capture service
  const capture = await captureService.createCapture({
    userId: item.userId,
    source: item.source,
    contentType: item.contentType,
    rawContent: item.rawContent,
    entityId: item.entityId,
    metadata: item.metadata,
  });

  // Process the capture (extraction, routing, etc.)
  await captureService.processCapture(capture.id);

  // Update progress to indicate completion
  await job.updateProgress(100);
}

/**
 * Create and start the BullMQ Worker for the capture queue.
 * The worker processes capture-item jobs with configurable concurrency.
 */
export function createCaptureWorker(options?: { concurrency?: number }): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'capture-item') {
        await processCaptureJob(job as Job<OfflineQueueItem>);
      }
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: options?.concurrency ?? 5,
    },
  );

  worker.on('failed', (job, err) => {
    const itemId = job?.data?.id ?? job?.id ?? 'unknown';
    console.error(`[capture-processor] Job ${itemId} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    const itemId = job?.data?.id ?? job.id;
    console.log(`[capture-processor] Job ${itemId} completed`);
  });

  worker.on('error', (err) => {
    console.error('[capture-processor] Worker error:', err.message);
  });

  return worker;
}

/**
 * Create a worker with a custom processing function.
 * Useful for testing or when custom capture logic is needed.
 */
export function createCustomCaptureWorker(
  processFn: (item: CaptureItem) => Promise<void>,
  options?: { concurrency?: number },
): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'capture-item') {
        await processFn(job.data as CaptureItem);
        await job.updateProgress(100);
      }
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: options?.concurrency ?? 5,
    },
  );

  worker.on('failed', (job, err) => {
    const itemId = job?.data?.id ?? job?.id ?? 'unknown';
    console.error(`[capture-processor] Job ${itemId} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    const itemId = job?.data?.id ?? job.id;
    console.log(`[capture-processor] Job ${itemId} completed`);
  });

  worker.on('error', (err) => {
    console.error('[capture-processor] Worker error:', err.message);
  });

  return worker;
}
