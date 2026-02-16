// ============================================================================
// Batch Capture Service
// Supports rapid-fire capture sessions ("I have 5 things to capture").
// Items are collected, then processed and routed all at once.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  CaptureItem,
  CaptureSource,
  BatchCaptureSession,
} from '@/modules/capture/types';
import { captureService } from '@/modules/capture/services/capture-service';

class BatchCaptureService {
  private sessions = new Map<string, BatchCaptureSession>();

  startBatchSession(userId: string): BatchCaptureSession {
    const session: BatchCaptureSession = {
      id: uuidv4(),
      userId,
      items: [],
      status: 'ACTIVE',
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  addToBatch(
    sessionId: string,
    rawContent: string,
    source: CaptureSource = 'VOICE',
  ): CaptureItem {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Batch session "${sessionId}" not found`);
    }

    if (session.status !== 'ACTIVE') {
      throw new Error(`Batch session "${sessionId}" is not active`);
    }

    const now = new Date();
    const item: CaptureItem = {
      id: uuidv4(),
      userId: session.userId,
      source,
      contentType: 'TEXT',
      rawContent,
      metadata: {},
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    session.items.push(item);
    return item;
  }

  async completeBatch(sessionId: string): Promise<CaptureItem[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
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
          entityId: item.entityId,
          metadata: item.metadata,
        });

        // Process and route it
        const processed = await captureService.processCapture(created.id);
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

    return processedItems;
  }

  getBatchStatus(sessionId: string): BatchCaptureSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  // For testing
  clearSessions(): void {
    this.sessions.clear();
  }
}

export const batchCaptureService = new BatchCaptureService();
export { BatchCaptureService };
