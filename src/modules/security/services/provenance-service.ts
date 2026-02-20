// ============================================================================
// Provenance Service — Data Provenance Tracking & Integrity Verification
// Worker 15: Security, Privacy & Compliance
//
// Provides two layers of provenance:
// 1. AI Output Provenance — tracks source documents used to generate AI outputs
// 2. Data Provenance — full audit trail of who did what, when, to which data,
//    with cryptographic hash chain for tamper detection and compliance reporting
// ============================================================================

import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProvenanceRecord,
  ProvenanceSource,
} from '@/modules/security/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0';
const HASH_ALGORITHM = 'sha256';

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
// ProvenanceService
// ---------------------------------------------------------------------------

export class ProvenanceService {
  /** Primary store: record id -> ProvenanceRecord (AI output provenance) */
  private readonly records: Map<string, ProvenanceRecord> = new Map();

  /** Secondary index: outputId -> ProvenanceRecord (for fast lookup) */
  private readonly outputIndex: Map<string, ProvenanceRecord> = new Map();

  /** Data provenance chain: ordered list of entries for hash chain integrity */
  private readonly provenanceChain: DataProvenanceEntry[] = [];

  /** Index: entityId -> entry ids for fast lookup */
  private readonly entityIndex: Map<string, string[]> = new Map();

  /** Index: targetKey (targetType:targetId) -> entry ids for document chain lookup */
  private readonly targetIndex: Map<string, string[]> = new Map();

  /** Index: id -> DataProvenanceEntry for O(1) lookup */
  private readonly provenanceById: Map<string, DataProvenanceEntry> = new Map();

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
    const record: ProvenanceRecord = {
      ...params,
      id: uuidv4(),
      createdAt: new Date(),
    };

    this.records.set(record.id, record);
    this.outputIndex.set(record.outputId, record);

    return record;
  }

  /**
   * Get the provenance record for a specific output.
   * Uses the secondary index for O(1) lookup by outputId.
   */
  async getProvenance(outputId: string): Promise<ProvenanceRecord | null> {
    return this.outputIndex.get(outputId) ?? null;
  }

  /**
   * Find all provenance records whose source documents reference
   * a specific source by its sourceId.
   */
  async getSourceUsage(sourceId: string): Promise<ProvenanceRecord[]> {
    const results: ProvenanceRecord[] = [];

    for (const record of this.records.values()) {
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
    const record = this.outputIndex.get(outputId);

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

    // Chain to the previous entry's hash
    const previousHash =
      this.provenanceChain.length > 0
        ? this.provenanceChain[this.provenanceChain.length - 1].hash
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

    const entry: DataProvenanceEntry = {
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

    // Store in chain and indexes
    this.provenanceChain.push(entry);
    this.provenanceById.set(id, entry);

    // Update entity index
    const entityEntries = this.entityIndex.get(entityId) ?? [];
    entityEntries.push(id);
    this.entityIndex.set(entityId, entityEntries);

    // Update target index
    if (targetType && targetId) {
      const targetKey = `${targetType}:${targetId}`;
      const targetEntries = this.targetIndex.get(targetKey) ?? [];
      targetEntries.push(id);
      this.targetIndex.set(targetKey, targetEntries);
    }

    return entry;
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
    const targetKey = `${targetType}:${documentId}`;
    const entryIds = this.targetIndex.get(targetKey) ?? [];

    const entries: DataProvenanceEntry[] = [];
    for (const id of entryIds) {
      const entry = this.provenanceById.get(id);
      if (entry) {
        entries.push(entry);
      }
    }

    // Return in chronological order
    return entries.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
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
    const entry = this.provenanceById.get(recordId);

    if (!entry) {
      return {
        valid: false,
        chainIntact: false,
        details: `Provenance record not found: ${recordId}`,
        recordId,
        computedHash: '',
        storedHash: '',
      };
    }

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
      // Find the entry in the chain that precedes this one
      const chainIndex = this.provenanceChain.findIndex((e) => e.id === entry.id);

      if (chainIndex > 0) {
        const predecessor = this.provenanceChain[chainIndex - 1];
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
    const entryIds = this.entityIndex.get(entityId) ?? [];
    let entries = entryIds
      .map((id) => this.provenanceById.get(id))
      .filter((e): e is DataProvenanceEntry => e !== undefined);

    // Apply date range filter
    if (dateRange) {
      entries = entries.filter(
        (e) => e.timestamp >= dateRange.from && e.timestamp <= dateRange.to,
      );
    }

    // Sort chronologically
    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

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
    const entryIds = this.entityIndex.get(entityId) ?? [];
    const allEntries = entryIds
      .map((id) => this.provenanceById.get(id))
      .filter((e): e is DataProvenanceEntry => e !== undefined);

    // Filter by date range
    const entries = allEntries
      .filter(
        (e) => e.timestamp >= dateRange.from && e.timestamp <= dateRange.to,
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

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
