// ============================================================================
// Core Capture Ingestion & Processing Service
// Creates capture items, processes raw content, and tracks latency metrics.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  CaptureItem,
  CaptureSource,
  CaptureContentType,
  CaptureMetadata,
  CaptureLatencyMetrics,
} from '@/modules/capture/types';
import { routingService } from '@/modules/capture/services/routing-service';
import { generateJSON } from '@/lib/ai';

class CaptureService {
  private captures = new Map<string, CaptureItem>();
  private latencyMetrics: CaptureLatencyMetrics[] = [];

  async createCapture(params: {
    userId: string;
    source: CaptureSource;
    contentType: CaptureContentType;
    rawContent: string;
    entityId?: string;
    metadata?: Partial<CaptureMetadata>;
  }): Promise<CaptureItem> {
    const now = new Date();
    const capture: CaptureItem = {
      id: uuidv4(),
      userId: params.userId,
      entityId: params.entityId,
      source: params.source,
      contentType: params.contentType,
      rawContent: params.rawContent,
      metadata: {
        ...params.metadata,
      },
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    this.captures.set(capture.id, capture);
    return capture;
  }

  async processCapture(captureId: string): Promise<CaptureItem> {
    const capture = this.captures.get(captureId);
    if (!capture) {
      throw new Error(`Capture "${captureId}" not found`);
    }

    const processStart = Date.now();
    capture.status = 'PROCESSING';
    capture.updatedAt = new Date();

    try {
      // Process based on content type
      capture.processedContent = this.extractContent(capture);

      const processEnd = Date.now();
      const captureToProcessedMs = processEnd - processStart;

      // Route the processed capture
      const routeStart = Date.now();
      const routingResult = await routingService.routeCapture(capture);
      const routeEnd = Date.now();
      const processedToRoutedMs = routeEnd - routeStart;

      capture.routingResult = routingResult;
      capture.status = 'ROUTED';
      capture.updatedAt = new Date();

      // Track latency
      capture.metadata.processingTimeMs = captureToProcessedMs;
      this.latencyMetrics.push({
        captureToProcessedMs,
        processedToRoutedMs,
        totalMs: captureToProcessedMs + processedToRoutedMs,
        source: capture.source,
        contentType: capture.contentType,
        timestamp: new Date(),
      });

      return capture;
    } catch (err) {
      capture.status = 'FAILED';
      capture.updatedAt = new Date();
      throw err;
    }
  }

  private extractContent(capture: CaptureItem): string {
    switch (capture.contentType) {
      case 'TEXT':
      case 'URL':
        return capture.rawContent;
      case 'AUDIO':
        return `[Transcribed audio] ${capture.rawContent}`;
      case 'IMAGE':
      case 'SCREENSHOT':
      case 'WHITEBOARD':
        return `[Extracted text from image] ${capture.rawContent}`;
      case 'BUSINESS_CARD':
        return `[Business card scan] ${capture.rawContent}`;
      case 'RECEIPT':
        return `[Receipt scan] ${capture.rawContent}`;
      case 'DOCUMENT':
        return capture.rawContent;
      default:
        return capture.rawContent;
    }
  }

  async classifyCaptureWithAI(captureId: string): Promise<{
    category: string;
    confidence: number;
    suggestedActions: string[];
  }> {
    const capture = this.captures.get(captureId);
    if (!capture) throw new Error(`Capture "${captureId}" not found`);

    try {
      const result = await generateJSON<{
        category: string;
        confidence: number;
        suggestedActions: string[];
      }>(`Classify this captured content and suggest actions.

Content type: ${capture.contentType}
Source: ${capture.source}
Content: "${(capture.processedContent ?? capture.rawContent).substring(0, 2000)}"

Return JSON with:
- category: one of NOTE, TASK, EVENT, CONTACT, RECEIPT, EXPENSE, DOCUMENT, REFERENCE
- confidence: 0-1
- suggestedActions: array of recommended next steps (e.g., "Create a task", "Add to calendar")`, {
        maxTokens: 256,
        temperature: 0.3,
        system: 'You are a content classification specialist. Categorize captured content accurately and suggest the most useful actions.',
      });

      return result;
    } catch {
      return {
        category: 'NOTE',
        confidence: 0.3,
        suggestedActions: ['Review manually'],
      };
    }
  }

  async getCaptureById(captureId: string): Promise<CaptureItem | null> {
    return this.captures.get(captureId) ?? null;
  }

  async listCaptures(
    userId: string,
    filters?: {
      source?: CaptureSource;
      status?: string;
      entityId?: string;
    },
    page = 1,
    pageSize = 20,
  ): Promise<{ data: CaptureItem[]; total: number }> {
    let results = Array.from(this.captures.values()).filter(
      (c) => c.userId === userId,
    );

    if (filters?.source) {
      results = results.filter((c) => c.source === filters.source);
    }
    if (filters?.status) {
      results = results.filter((c) => c.status === filters.status);
    }
    if (filters?.entityId) {
      results = results.filter((c) => c.entityId === filters.entityId);
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = results.length;
    const start = (page - 1) * pageSize;
    const data = results.slice(start, start + pageSize);

    return { data, total };
  }

  async archiveCapture(captureId: string): Promise<void> {
    const capture = this.captures.get(captureId);
    if (!capture) {
      throw new Error(`Capture "${captureId}" not found`);
    }
    capture.status = 'ARCHIVED';
    capture.updatedAt = new Date();
  }

  async getCaptureMetrics(userId: string): Promise<CaptureLatencyMetrics[]> {
    // In production, filter by userId via DB query
    return [...this.latencyMetrics];
  }

  // For testing
  clearAll(): void {
    this.captures.clear();
    this.latencyMetrics = [];
  }
}

export const captureService = new CaptureService();
export { CaptureService };
