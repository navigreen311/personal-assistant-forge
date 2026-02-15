// ============================================================================
// Legal Hold & eDiscovery Service
// Worker 15: Security, Privacy & Compliance
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import type { LegalHold, LegalHoldScope } from '@/modules/security/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeldRecord {
  model: string;
  recordId: string;
  reason: string;
}

type PrismaRecord = {
  id: string;
  createdAt: Date;
  entityId?: string;
  senderId?: string;
  recipientId?: string;
  contactId?: string;
  projectId?: string;
  body?: string;
  content?: string;
  title?: string;
  description?: string;
  transcript?: string;
  reason?: string;
  target?: string;
};

// ---------------------------------------------------------------------------
// Supported Prisma model names (for scope.dataTypes matching)
// ---------------------------------------------------------------------------

const SUPPORTED_MODELS = [
  'Message',
  'Task',
  'Document',
  'Call',
  'Contact',
  'ActionLog',
  'KnowledgeEntry',
] as const;

type SupportedModel = (typeof SUPPORTED_MODELS)[number];

// ---------------------------------------------------------------------------
// LegalHoldService
// ---------------------------------------------------------------------------

export class LegalHoldService {
  private readonly holds: Map<string, LegalHold> = new Map();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a new legal hold.
   */
  async createLegalHold(
    params: Omit<LegalHold, 'id' | 'createdAt' | 'releasedAt'>,
  ): Promise<LegalHold> {
    const hold: LegalHold = {
      ...params,
      id: uuidv4(),
      createdAt: new Date(),
      releasedAt: undefined,
    };

    this.holds.set(hold.id, hold);

    return hold;
  }

  /**
   * Release a legal hold by setting its status to RELEASED and recording the
   * release timestamp.
   */
  async releaseLegalHold(holdId: string): Promise<LegalHold> {
    const hold = this.holds.get(holdId);
    if (!hold) {
      throw new Error(`Legal hold not found: ${holdId}`);
    }

    hold.status = 'RELEASED';
    hold.releasedAt = new Date();

    return hold;
  }

  /**
   * Retrieve a legal hold by ID.
   */
  async getLegalHold(holdId: string): Promise<LegalHold | null> {
    return this.holds.get(holdId) ?? null;
  }

  /**
   * List legal holds for a given entity, optionally filtered by status.
   */
  async listLegalHolds(
    entityId: string,
    status?: 'ACTIVE' | 'RELEASED',
  ): Promise<LegalHold[]> {
    const results: LegalHold[] = [];

    for (const hold of this.holds.values()) {
      if (hold.entityId !== entityId) continue;
      if (status && hold.status !== status) continue;

      results.push(hold);
    }

    return results;
  }

  /**
   * Check whether a specific record is covered by any active legal hold.
   *
   * Evaluates hold scopes against the record:
   *  - dataTypes: model name must be listed
   *  - contactIds: record's contact / sender / recipient must match
   *  - dateRange: record's createdAt must fall within range
   *  - keywords: record content must contain at least one keyword
   *  - If no scope criteria are specified the hold covers everything for the entity.
   */
  async isRecordUnderHold(model: string, recordId: string): Promise<boolean> {
    const record = await this.fetchRecord(model, recordId);
    if (!record) return false;

    const entityId = record.entityId;
    if (!entityId) return false;

    const activeHolds = await this.listLegalHolds(entityId, 'ACTIVE');
    if (activeHolds.length === 0) return false;

    for (const hold of activeHolds) {
      if (this.doesRecordMatchScope(hold.scope, model, record)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Collect all records that fall under a specific legal hold.
   */
  async getHeldRecords(holdId: string): Promise<HeldRecord[]> {
    const hold = this.holds.get(holdId);
    if (!hold) {
      throw new Error(`Legal hold not found: ${holdId}`);
    }

    const results: HeldRecord[] = [];
    const modelsToSearch = this.resolveModels(hold.scope);

    for (const model of modelsToSearch) {
      const records = await this.queryModelRecords(model, hold.entityId, hold.scope);

      for (const record of records) {
        if (this.doesRecordMatchScope(hold.scope, model, record)) {
          const reasons = this.buildMatchReasons(hold.scope, model, record);
          results.push({
            model,
            recordId: record.id,
            reason: reasons.join('; '),
          });
        }
      }
    }

    return results;
  }

  /**
   * Export held records for legal review / eDiscovery in JSON or CSV format.
   */
  async exportForDiscovery(
    holdId: string,
    format: 'JSON' | 'CSV',
  ): Promise<{ data: string; recordCount: number }> {
    const heldRecords = await this.getHeldRecords(holdId);

    if (format === 'CSV') {
      const header = 'model,recordId,reason';
      const rows = heldRecords.map(
        (r) =>
          `${this.escapeCsv(r.model)},${this.escapeCsv(r.recordId)},${this.escapeCsv(r.reason)}`,
      );
      return {
        data: [header, ...rows].join('\n'),
        recordCount: heldRecords.length,
      };
    }

    // Default: JSON
    return {
      data: JSON.stringify(heldRecords, null, 2),
      recordCount: heldRecords.length,
    };
  }

  // -------------------------------------------------------------------------
  // Private — scope matching
  // -------------------------------------------------------------------------

  /**
   * Determine whether a record matches a hold scope.
   * If the scope has no criteria at all, the hold is considered to cover
   * everything for the entity (blanket hold).
   */
  private doesRecordMatchScope(
    scope: LegalHoldScope,
    model: string,
    record: PrismaRecord,
  ): boolean {
    const hasCriteria =
      (scope.dataTypes && scope.dataTypes.length > 0) ||
      (scope.contactIds && scope.contactIds.length > 0) ||
      (scope.projectIds && scope.projectIds.length > 0) ||
      scope.dateRange !== undefined ||
      (scope.keywords && scope.keywords.length > 0);

    // Blanket hold — no criteria means everything is covered
    if (!hasCriteria) return true;

    // Each present criterion acts as an AND filter: the record must satisfy
    // every specified criterion to be considered held.
    if (scope.dataTypes && scope.dataTypes.length > 0) {
      if (!scope.dataTypes.includes(model)) return false;
    }

    if (scope.contactIds && scope.contactIds.length > 0) {
      const recordContactIds = [
        record.entityId,
        record.senderId,
        record.recipientId,
        record.contactId,
      ].filter(Boolean) as string[];

      const hasContactMatch = scope.contactIds.some((cid) =>
        recordContactIds.includes(cid),
      );
      if (!hasContactMatch) return false;
    }

    if (scope.projectIds && scope.projectIds.length > 0) {
      if (!record.projectId || !scope.projectIds.includes(record.projectId)) {
        return false;
      }
    }

    if (scope.dateRange) {
      const from = new Date(scope.dateRange.from);
      const to = new Date(scope.dateRange.to);
      const created = new Date(record.createdAt);
      if (created < from || created > to) return false;
    }

    if (scope.keywords && scope.keywords.length > 0) {
      const content = this.extractSearchableContent(record);
      const lowerContent = content.toLowerCase();
      const hasKeyword = scope.keywords.some((kw) =>
        lowerContent.includes(kw.toLowerCase()),
      );
      if (!hasKeyword) return false;
    }

    return true;
  }

  /**
   * Build human-readable reasons explaining why a record matched a hold scope.
   */
  private buildMatchReasons(
    scope: LegalHoldScope,
    model: string,
    record: PrismaRecord,
  ): string[] {
    const reasons: string[] = [];

    const hasCriteria =
      (scope.dataTypes && scope.dataTypes.length > 0) ||
      (scope.contactIds && scope.contactIds.length > 0) ||
      (scope.projectIds && scope.projectIds.length > 0) ||
      scope.dateRange !== undefined ||
      (scope.keywords && scope.keywords.length > 0);

    if (!hasCriteria) {
      reasons.push('Blanket hold — all records for entity are covered');
      return reasons;
    }

    if (scope.dataTypes?.includes(model)) {
      reasons.push(`Data type match: ${model}`);
    }

    if (scope.contactIds && scope.contactIds.length > 0) {
      const ids = [record.senderId, record.recipientId, record.contactId].filter(
        Boolean,
      ) as string[];
      const matched = scope.contactIds.filter((cid) => ids.includes(cid));
      if (matched.length > 0) {
        reasons.push(`Contact match: ${matched.join(', ')}`);
      }
    }

    if (scope.projectIds && record.projectId && scope.projectIds.includes(record.projectId)) {
      reasons.push(`Project match: ${record.projectId}`);
    }

    if (scope.dateRange) {
      reasons.push(
        `Date range: ${new Date(scope.dateRange.from).toISOString()} – ${new Date(scope.dateRange.to).toISOString()}`,
      );
    }

    if (scope.keywords && scope.keywords.length > 0) {
      const content = this.extractSearchableContent(record).toLowerCase();
      const matched = scope.keywords.filter((kw) =>
        content.includes(kw.toLowerCase()),
      );
      if (matched.length > 0) {
        reasons.push(`Keyword match: ${matched.join(', ')}`);
      }
    }

    return reasons;
  }

  // -------------------------------------------------------------------------
  // Private — record fetching
  // -------------------------------------------------------------------------

  /**
   * Fetch a single record from Prisma by model name and ID.
   */
  private async fetchRecord(
    model: string,
    recordId: string,
  ): Promise<PrismaRecord | null> {
    switch (model) {
      case 'Message':
        return prisma.message.findUnique({ where: { id: recordId } });
      case 'Task':
        return prisma.task.findUnique({ where: { id: recordId } });
      case 'Document':
        return prisma.document.findUnique({ where: { id: recordId } });
      case 'Call':
        return prisma.call.findUnique({ where: { id: recordId } });
      case 'Contact':
        return prisma.contact.findUnique({ where: { id: recordId } });
      case 'ActionLog':
        return prisma.actionLog.findUnique({ where: { id: recordId } }) as Promise<PrismaRecord | null>;
      case 'KnowledgeEntry':
        return prisma.knowledgeEntry.findUnique({ where: { id: recordId } });
      default:
        return null;
    }
  }

  /**
   * Query all records of a given model for an entity, optionally narrowed by
   * a date range from the hold scope.
   */
  private async queryModelRecords(
    model: SupportedModel,
    entityId: string,
    scope: LegalHoldScope,
  ): Promise<PrismaRecord[]> {
    const dateFilter = scope.dateRange
      ? {
          createdAt: {
            gte: new Date(scope.dateRange.from),
            lte: new Date(scope.dateRange.to),
          },
        }
      : {};

    switch (model) {
      case 'Message':
        return prisma.message.findMany({
          where: { entityId, ...dateFilter },
        });
      case 'Task':
        return prisma.task.findMany({
          where: { entityId, ...dateFilter },
        });
      case 'Document':
        return prisma.document.findMany({
          where: { entityId, ...dateFilter },
        });
      case 'Call':
        return prisma.call.findMany({
          where: { entityId, ...dateFilter },
        });
      case 'Contact':
        return prisma.contact.findMany({
          where: { entityId, ...dateFilter },
        });
      case 'ActionLog':
        return prisma.actionLog.findMany({
          where: dateFilter,
        }) as Promise<PrismaRecord[]>;
      case 'KnowledgeEntry':
        return prisma.knowledgeEntry.findMany({
          where: { entityId, ...dateFilter },
        });
      default:
        return [];
    }
  }

  /**
   * Determine which models to query based on the hold scope.
   * If dataTypes is specified, only query those models; otherwise query all.
   */
  private resolveModels(scope: LegalHoldScope): SupportedModel[] {
    if (scope.dataTypes && scope.dataTypes.length > 0) {
      return scope.dataTypes.filter((dt): dt is SupportedModel =>
        SUPPORTED_MODELS.includes(dt as SupportedModel),
      );
    }

    return [...SUPPORTED_MODELS];
  }

  /**
   * Extract a single searchable string from a record for keyword matching.
   */
  private extractSearchableContent(record: PrismaRecord): string {
    const parts: string[] = [];

    if (record.body) parts.push(record.body);
    if (record.content) parts.push(record.content);
    if (record.title) parts.push(record.title);
    if (record.description) parts.push(record.description);
    if (record.transcript) parts.push(record.transcript);
    if (record.reason) parts.push(record.reason);
    if (record.target) parts.push(record.target);

    return parts.join(' ');
  }

  // -------------------------------------------------------------------------
  // Private — CSV helpers
  // -------------------------------------------------------------------------

  /**
   * Escape a value for safe CSV embedding. Wraps in quotes if the value
   * contains commas, quotes, or newlines.
   */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const legalHoldService = new LegalHoldService();
