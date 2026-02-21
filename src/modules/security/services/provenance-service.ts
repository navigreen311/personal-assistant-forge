// ============================================================================
// Provenance Service — Data Provenance Tracking & Integrity Verification
// Worker 15: Security, Privacy & Compliance
//
// Provides two layers of provenance:
// 1. AI Output Provenance — tracks source documents used to generate AI outputs
// 2. Data Provenance — full audit trail of who did what, when, to which data,
//    with cryptographic hash chain for tamper detection and compliance reporting
//
// Persistence: Prisma (provenanceRecord model)
// ============================================================================

import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type {
  ProvenanceRecord,
  ProvenanceSource,
} from '@/modules/security/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0';
const HASH_ALGORITHM = 'sha256';

/**
 * Discriminator stored in metadata.recordType to distinguish between
 * AI-output provenance rows and data-provenance (audit trail) rows.
 */
const RECORD_TYPE_AI = 'AI_OUTPUT';
const RECORD_TYPE_DATA = 'DATA_PROVENANCE';

// ---------------------------------------------------------------------------
// Data Provenance Types (audit trail layer)
// ---------------------------------------------------------------------------

export interface DataProvenanceEntry {
  id: string;
  entityId: string;
  action: string;
  actor?: string;
  targetType?: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  hash: string;
  previousHash: string;
}

export interface ProvenanceReportEntry {
  action: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  actors: string[];
}

export interface ProvenanceReport {
  entityId: string;
  dateRange: { from: Date; to: Date };
  totalEvents: number;
  entries: DataProvenanceEntry[];
  summary: ProvenanceReportEntry[];
  integrityVerified: boolean;
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers: row <-> domain object mapping
// ---------------------------------------------------------------------------

/** Shape of a Prisma provenanceRecord row */
interface PrismaRow {
  id: string;
  userId: string | null;
  entityId: string | null;
  targetType: string | null;
  targetId: string | null;
  inputHash: string;
  outputHash: string;
  modelId: string;
  promptTemplate: string | null;
  metadata: unknown;
  timestamp: Date;
}

/** Convert a Prisma row (data-provenance type) back to a DataProvenanceEntry */
function rowToDataEntry(row: PrismaRow): DataProvenanceEntry {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    entityId: row.entityId ?? '',
    action: (meta.action as string) ?? '',
    actor: (meta.actor as string) ?? undefined,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    metadata: (meta.userMetadata as Record<string, unknown>) ?? {},
    timestamp: row.timestamp,
    hash: row.outputHash,
    previousHash: row.inputHash,
  };
}

/** Convert a Prisma row (AI-output type) back to a ProvenanceRecord */
function rowToProvenanceRecord(row: PrismaRow): ProvenanceRecord {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    outputId: row.outputHash,
    outputType: (meta.outputType as string) ?? '',
    sourceDocuments: (meta.sourceDocuments as ProvenanceSource[]) ?? [],
    modelUsed: row.modelId || undefined,
    prompt: row.promptTemplate ?? undefined,
    confidence: (meta.confidence as number) ?? 0,
    createdAt: row.timestamp,
  };
}

// ---------------------------------------------------------------------------
// ProvenanceService
// ---------------------------------------------------------------------------

export class ProvenanceService {
  // -------------------------------------------------------------------------
  // AI Output Provenance — Public API (original interface preserved)
  // -------------------------------------------------------------------------

  /**
   * Record provenance of an AI-generated output.
   * Assigns a unique id and creation timestamp, then stores the record
   * in both the primary store and the output index.
   */
  async recordProvenance(
    params: Omit<ProvenanceRecord, 'id' | 'createdAt'>,
  ): Promise<ProvenanceRecord> {
    const id = uuidv4();
    const now = new Date();

    const row = await prisma.provenanceRecord.create({
      data: {
        id,
        outputHash: params.outputId,
        inputHash: '',
        modelId: params.modelUsed ?? '',
        promptTemplate: params.prompt ?? null,
        metadata: {
          recordType: RECORD_TYPE_AI,
          outputType: params.outputType,
          sourceDocuments: params.sourceDocuments,
          confidence: params.confidence,
        },
        timestamp: now,
      } as unknown as Parameters<typeof prisma.provenanceRecord.create>[0]['data'],
    });

    return rowToProvenanceRecord(row as unknown as PrismaRow);
  }

  /**
   * Get the provenance record for a specific output.
   * Uses the secondary index for O(1) lookup by outputId.
   */
  async getProvenance(outputId: string): Promise<ProvenanceRecord | null> {
    const row = await prisma.provenanceRecord.findFirst({
      where: { outputHash: outputId },
    });

    if (!row) return null;
    return rowToProvenanceRecord(row as unknown as PrismaRow);
  }

  /**
   * Find all provenance records whose source documents reference
   * a specific source by its sourceId.
   */
  async getSourceUsage(sourceId: string): Promise<ProvenanceRecord[]> {
    // Fetch all AI-output provenance rows; filter by sourceDocuments in memory
    // because nested JSON array filtering is not reliably supported across
    // all Prisma adapters.
    const rows = await prisma.provenanceRecord.findMany();

    const results: ProvenanceRecord[] = [];

    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      if (meta.recordType !== RECORD_TYPE_AI) continue;

      const record = rowToProvenanceRecord(row as unknown as PrismaRow);
      const usesSource = record.sourceDocuments.some(
        (source: ProvenanceSource) => source.sourceId === sourceId,
      );
      if (usesSource) {
        results.push(record);
      }
    }

    return results;
  }

  /**
   * Validate that all cited sources in a provenance record still exist
   * and are accessible. For now, a source is considered valid if its
   * sourceId is a non-empty string.
   */
  async validateProvenance(
    outputId: string,
  ): Promise<{
    valid: boolean;
    missingSource: boolean;
    sourceAvailable: boolean[];
  }> {
    const record = await this.getProvenance(outputId);

    if (!record) {
      return {
        valid: false,
        missingSource: true,
        sourceAvailable: [],
      };
    }

    const sourceAvailable: boolean[] = record.sourceDocuments.map(
      (source: ProvenanceSource) =>
        typeof source.sourceId === 'string' && source.sourceId.length > 0,
    );

    const allAvailable = sourceAvailable.every(
      (available: boolean) => available,
    );

    return {
      valid: allAvailable,
      missingSource: !allAvailable,
      sourceAvailable,
    };
  }

  // -------------------------------------------------------------------------
  // Data Provenance — Public API (audit trail with hash chain)
  // -------------------------------------------------------------------------

  /**
   * Record a data provenance event: log who did what, when, to which data.
   *
   * Each entry is chained to the previous one via SHA-256 hash, creating a
   * tamper-evident log. The hash covers the entry's core fields plus the
   * previous entry's hash to form an immutable chain.
   *
   * @param entityId - The entity (organization/user) this event belongs to
   * @param action - The action performed (e.g., 'CREATE', 'UPDATE', 'DELETE', 'ACCESS', 'SHARE')
   * @param metadata - Additional context: actor, target, reason, IP, etc.
   */
  async recordDataProvenance(
    entityId: string,
    action: string,
    metadata: Record<string, unknown> = {},
  ): Promise<DataProvenanceEntry> {
    const id = uuidv4();
    const timestamp = new Date();

    // Chain to the previous entry's hash — find the latest entry globally
    const lastEntry = await prisma.provenanceRecord.findFirst({
      where: {
        metadata: {
          path: ['recordType'],
          equals: RECORD_TYPE_DATA,
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    const previousHash = lastEntry
      ? (lastEntry as unknown as PrismaRow).outputHash
      : GENESIS_HASH;

    // Extract well-known metadata fields for indexing
    const actor = typeof metadata.actor === 'string' ? metadata.actor : undefined;
    const targetType = typeof metadata.targetType === 'string' ? metadata.targetType : undefined;
    const targetId = typeof metadata.targetId === 'string' ? metadata.targetId : undefined;

    // Calculate the hash over canonical fields
    const hash = this.calculateEntryHash({
      id,
      entityId,
      action,
      actor,
      targetType,
      targetId,
      metadata,
      timestamp,
      previousHash,
    });

    // Persist via Prisma
    await prisma.provenanceRecord.create({
      data: {
        id,
        entityId,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        inputHash: previousHash,
        outputHash: hash,
        modelId: '',
        metadata: {
          recordType: RECORD_TYPE_DATA,
          action,
          actor: actor ?? null,
          userMetadata: metadata,
        },
        timestamp,
      } as unknown as Parameters<typeof prisma.provenanceRecord.create>[0]['data'],
    });

    return {
      id,
      entityId,
      action,
      actor,
      targetType,
      targetId,
      metadata,
      timestamp,
      hash,
      previousHash,
    };
  }

  /**
   * Get the full provenance chain (audit trail) for a specific document or
   * any target resource. Returns all events in chronological order.
   *
   * @param documentId - The target resource ID to look up
   * @param targetType - Optional target type filter (defaults to 'DOCUMENT')
   */
  async getProvenanceChain(
    documentId: string,
    targetType: string = 'DOCUMENT',
  ): Promise<DataProvenanceEntry[]> {
    const rows = await prisma.provenanceRecord.findMany({
      where: { targetType, targetId: documentId },
      orderBy: { timestamp: 'asc' },
    });

    return rows.map((r: unknown) => rowToDataEntry(r as PrismaRow));
  }

  /**
   * Verify the integrity of a specific provenance record by recalculating
   * its hash and checking the chain link to its predecessor.
   *
   * Returns detailed information about the integrity check:
   * - valid: whether the record's hash is intact
   * - chainIntact: whether the link to the previous record is valid
   * - details: human-readable explanation
   *
   * @param recordId - The provenance entry ID to verify
   */
  async verifyIntegrity(
    recordId: string,
  ): Promise<{
    valid: boolean;
    chainIntact: boolean;
    details: string;
    recordId: string;
    computedHash: string;
    storedHash: string;
  }> {
    const row = await prisma.provenanceRecord.findUnique({
      where: { id: recordId },
    });

    if (!row) {
      return {
        valid: false,
        chainIntact: false,
        details: `Provenance record not found: ${recordId}`,
        recordId,
        computedHash: '',
        storedHash: '',
      };
    }

    const entry = rowToDataEntry(row as unknown as PrismaRow);

    // Recalculate the expected hash
    const computedHash = this.calculateEntryHash({
      id: entry.id,
      entityId: entry.entityId,
      action: entry.action,
      actor: entry.actor,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      timestamp: entry.timestamp,
      previousHash: entry.previousHash,
    });

    const hashValid = entry.hash === computedHash;

    // Verify the chain link: find the predecessor and check its hash
    // matches this entry's previousHash
    let chainIntact = true;
    let chainDetail = '';

    if (entry.previousHash === GENESIS_HASH) {
      // This is the first entry in the chain — no predecessor to verify
      chainDetail = 'First entry in chain (genesis).';
    } else {
      // Find all data-provenance entries ordered by timestamp to locate predecessor
      const allRows = await prisma.provenanceRecord.findMany({
        where: {
          metadata: {
            path: ['recordType'],
            equals: RECORD_TYPE_DATA,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      const chain = allRows.map((r: unknown) => rowToDataEntry(r as PrismaRow));
      const chainIndex = chain.findIndex((e) => e.id === entry.id);

      if (chainIndex > 0) {
        const predecessor = chain[chainIndex - 1];
        if (predecessor.hash !== entry.previousHash) {
          chainIntact = false;
          chainDetail = `Chain broken: predecessor hash mismatch. Expected ${entry.previousHash}, found ${predecessor.hash}.`;
        } else {
          chainDetail = 'Chain link to predecessor verified.';
        }
      } else if (chainIndex === 0) {
        // First in chain but previousHash is not genesis
        chainIntact = entry.previousHash === GENESIS_HASH;
        chainDetail = chainIntact
          ? 'First entry with genesis hash.'
          : 'First entry in chain but previousHash is not genesis.';
      } else {
        // Entry not found in chain array
        chainIntact = false;
        chainDetail = 'Entry not found in chain sequence.';
      }
    }

    const valid = hashValid && chainIntact;
    const details = hashValid
      ? `Hash verified. ${chainDetail}`
      : `Hash mismatch: record may have been tampered with. Stored=${entry.hash}, Computed=${computedHash}. ${chainDetail}`;

    return {
      valid,
      chainIntact,
      details,
      recordId,
      computedHash,
      storedHash: entry.hash,
    };
  }

  /**
   * Verify the integrity of the entire provenance chain for an entity
   * within a date range. Walks entries chronologically, recalculates
   * each hash, and verifies chain links.
   */
  async verifyChainIntegrity(
    entityId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<{
    valid: boolean;
    checkedEntries: number;
    brokenAt?: string;
    details: string;
  }> {
    // Build the where clause for entity + optional date range
    const where: Record<string, unknown> = { entityId };
    if (dateRange) {
      where.timestamp = { gte: dateRange.from, lte: dateRange.to };
    }

    const rows = await prisma.provenanceRecord.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    const entries = rows.map((r: unknown) => rowToDataEntry(r as PrismaRow));

    if (entries.length === 0) {
      return {
        valid: true,
        checkedEntries: 0,
        details: 'No entries found for the specified criteria.',
      };
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Recalculate hash
      const expectedHash = this.calculateEntryHash({
        id: entry.id,
        entityId: entry.entityId,
        action: entry.action,
        actor: entry.actor,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        timestamp: entry.timestamp,
        previousHash: entry.previousHash,
      });

      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          checkedEntries: i + 1,
          brokenAt: entry.id,
          details: `Hash mismatch at entry ${entry.id}: expected ${expectedHash}, found ${entry.hash}`,
        };
      }

      // Verify chain link between consecutive entries in this filtered set
      if (i > 0) {
        const predecessor = entries[i - 1];
        if (entry.previousHash !== predecessor.hash) {
          return {
            valid: false,
            checkedEntries: i + 1,
            brokenAt: entry.id,
            details: `Chain link broken at entry ${entry.id}: previousHash does not match predecessor's hash`,
          };
        }
      }
    }

    return {
      valid: true,
      checkedEntries: entries.length,
      details: `All ${entries.length} entries verified successfully.`,
    };
  }

  /**
   * Generate a compliance-oriented provenance report for an entity over a
   * date range. Includes full event listing, summary statistics grouped by
   * action type, and an integrity verification.
   *
   * @param entityId - The entity to report on
   * @param dateRange - The time window for the report
   */
  async getProvenanceReport(
    entityId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<ProvenanceReport> {
    const rows = await prisma.provenanceRecord.findMany({
      where: {
        entityId,
        timestamp: { gte: dateRange.from, lte: dateRange.to },
      },
      orderBy: { timestamp: 'asc' },
    });

    const entries = rows.map((r: unknown) => rowToDataEntry(r as PrismaRow));

    // Build summary: group by action type
    const actionGroups = new Map<
      string,
      { count: number; first: Date; last: Date; actors: Set<string> }
    >();

    for (const entry of entries) {
      const group = actionGroups.get(entry.action);
      if (group) {
        group.count++;
        if (entry.timestamp < group.first) group.first = entry.timestamp;
        if (entry.timestamp > group.last) group.last = entry.timestamp;
        if (entry.actor) group.actors.add(entry.actor);
      } else {
        actionGroups.set(entry.action, {
          count: 1,
          first: entry.timestamp,
          last: entry.timestamp,
          actors: new Set(entry.actor ? [entry.actor] : []),
        });
      }
    }

    const summary: ProvenanceReportEntry[] = [];
    for (const [action, group] of actionGroups.entries()) {
      summary.push({
        action,
        count: group.count,
        firstOccurrence: group.first,
        lastOccurrence: group.last,
        actors: Array.from(group.actors),
      });
    }

    // Sort summary by count descending
    summary.sort((a, b) => b.count - a.count);

    // Verify chain integrity for the report period
    const integrity = await this.verifyChainIntegrity(entityId, dateRange);

    return {
      entityId,
      dateRange,
      totalEvents: entries.length,
      entries,
      summary,
      integrityVerified: integrity.valid,
      generatedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Calculate a SHA-256 hash over the canonical set of provenance entry fields.
   * The hash covers all immutable fields plus the previous hash to form a chain.
   */
  private calculateEntryHash(payload: {
    id: string;
    entityId: string;
    action: string;
    actor?: string;
    targetType?: string;
    targetId?: string;
    metadata: Record<string, unknown>;
    timestamp: Date;
    previousHash: string;
  }): string {
    const canonical = JSON.stringify({
      id: payload.id,
      entityId: payload.entityId,
      action: payload.action,
      actor: payload.actor ?? null,
      targetType: payload.targetType ?? null,
      targetId: payload.targetId ?? null,
      metadata: payload.metadata,
      timestamp: payload.timestamp.toISOString(),
      previousHash: payload.previousHash,
    });

    return crypto
      .createHash(HASH_ALGORITHM)
      .update(canonical)
      .digest('hex');
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const provenanceService = new ProvenanceService();
