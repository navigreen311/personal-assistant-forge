// ============================================================================
// Provenance Service — AI Output Provenance Tracking
// Worker 15: Security, Privacy & Compliance
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  ProvenanceRecord,
  ProvenanceSource,
} from '@/modules/security/types';

// ---------------------------------------------------------------------------
// ProvenanceService
// ---------------------------------------------------------------------------

export class ProvenanceService {
  /** Primary store: record id -> ProvenanceRecord */
  private readonly records: Map<string, ProvenanceRecord> = new Map();

  /** Secondary index: outputId -> ProvenanceRecord (for fast lookup) */
  private readonly outputIndex: Map<string, ProvenanceRecord> = new Map();

  // -------------------------------------------------------------------------
  // Public API
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
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const provenanceService = new ProvenanceService();
