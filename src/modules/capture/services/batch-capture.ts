// ============================================================================
// Batch Capture Service
// Supports rapid-fire capture sessions ("I have 5 things to capture").
// Items are collected, then processed and routed all at once.
// Stores batch summary in Prisma Document model on completion.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  CaptureItem,
  CaptureSource,
  CaptureContentType,
  BatchCaptureSession,
} from '@/modules/capture/types';
import { captureService } from '@/modules/capture/services/capture-service';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

/**
 * P-13. Batch sessions live in a `Map` keyed by an opaque id, and every entry
 * point took ONLY that id -- so any authenticated caller who learned a session
 * id could add items to another tenant's batch or complete it. The owner is now
 * part of every lookup.
 *
 * `startBatchSession` also took `userId` straight from the request body, so a
 * caller opened a session in someone else's name; it now comes from the session.
 *
 * Separately, `completeBatch` wrote its summary Document with
 * `entityId: session.userId` -- a USER id in `Document.entityId`, which is a
 * required foreign key to `Entity`. Against a real Postgres that insert fails,
 * so completing a batch always threw. The session now carries a proven entity
 * and the summary is skipped when there is none.
 */

const VALID_SOURCES: CaptureSource[] = [
  'VOICE', 'SCREENSHOT', 'CLIPBOARD', 'SHARE_SHEET', 'BROWSER_EXTENSION',
  'EMAIL_FORWARD', 'SMS_BRIDGE', 'DESKTOP_TRAY', 'CAMERA_SCAN', 'MANUAL',
];

class BatchCaptureService {
  private sessions = new Map<string, BatchCaptureSession>();

  startBatchSession(userId: string, entityId?: VerifiedEntityId): BatchCaptureSession {
    const session: BatchCaptureSession = {
      id: uuidv4(),
      userId,
      entityId,
      items: [],
      status: 'ACTIVE',
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  addToBatch(
    sessionId: string,
    userId: string,
    rawContent: string,
    source: CaptureSource = 'VOICE',
    contentType: CaptureContentType = 'TEXT',
  ): CaptureItem {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      // Deliberately indistinguishable from a genuinely missing session.
      throw new Error(`Batch session "${sessionId}" not found`);
    }

    if (session.status !== 'ACTIVE') {
      throw new Error(`Batch session "${sessionId}" is not active`);
    }

    // Validate rawContent is non-empty
    if (!rawContent || rawContent.trim().length === 0) {
      throw new Error('rawContent must be non-empty');
    }

    // Validate source is a valid CaptureSource
    if (!VALID_SOURCES.includes(source)) {
      throw new Error(`Invalid source "${source}". Must be one of: ${VALID_SOURCES.join(', ')}`);
    }

    const now = new Date();
    const item: CaptureItem = {
      id: uuidv4(),
      userId: session.userId,
      entityId: session.entityId,
      source,
      contentType,
      rawContent,
      metadata: {},
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    session.items.push(item);
    return item;
  }

  async completeBatch(sessionId: string, userId: string): Promise<CaptureItem[]> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error(`Batch session "${sessionId}" not found`);
    }

    if (session.status !== 'ACTIVE') {
      throw new Error(`Batch session "${sessionId}" is already completed`);
    }

    const processedItems: CaptureItem[] = [];

    for (const item of session.items) {
      try {
        // Create the capture through the main capture service
        const created = await captureService.createCapture({
          userId: session.userId,
          source: item.source,
          contentType: item.contentType,
          rawContent: item.rawContent,
          entityId: session.entityId as VerifiedEntityId | undefined,
          metadata: item.metadata,
        });

        // Process and route it
        const processed = await captureService.processCapture(created.id, session.userId);
        processedItems.push(processed);
      } catch {
        // Mark individual item as failed but continue with the rest
        item.status = 'FAILED';
        item.updatedAt = new Date();
        processedItems.push(item);
      }
    }

    session.status = 'COMPLETED';
    session.completedAt = new Date();
    session.items = processedItems;

    // Store batch summary in Prisma Document. `Document.entityId` is a required
    // FK to Entity, so with no proven entity there is nowhere to file it and
    // guessing one is the bug this package exists to close.
    if (session.entityId) {
    await prisma.document.create({
      data: {
        title: `Batch Capture ${session.id}`,
        entityId: session.entityId,
        type: 'BATCH_CAPTURE',
        content: JSON.stringify({
          sessionId: session.id,
          itemCount: processedItems.length,
          successCount: processedItems.filter(i => i.status !== 'FAILED').length,
          failedCount: processedItems.filter(i => i.status === 'FAILED').length,
          processedAt: new Date().toISOString(),
        }),
        status: 'APPROVED',
      },
    });
    }

    return processedItems;
  }

  getBatchStatus(sessionId: string, userId: string): BatchCaptureSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  }

  // For testing
  clearSessions(): void {
    this.sessions.clear();
  }
}

export const batchCaptureService = new BatchCaptureService();
export { BatchCaptureService };
