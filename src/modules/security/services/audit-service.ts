// ============================================================================
// Audit Service — Tamper-Proof Audit Logging with Hash Chain Verification
// Worker 15: Security, Privacy & Compliance
// ============================================================================

import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  AuditLogEntry,
  DataClassification,
} from '@/modules/security/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;
const GENESIS_HASH = '0';

// ---------------------------------------------------------------------------
// CSV Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a value for safe CSV inclusion (RFC 4180).
 */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

export class AuditService {
  private readonly entries: AuditLogEntry[] = [];

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a tamper-proof audit log entry.
   * Calculates a SHA-256 hash and chains it to the previous entry for
   * tamper detection.
   */
  async logAuditEntry(
    params: Omit<AuditLogEntry, 'id' | 'timestamp' | 'hash' | 'previousHash'>,
  ): Promise<AuditLogEntry> {
    const id = uuidv4();
    const timestamp = new Date();

    const previousHash =
      this.entries.length > 0
        ? this.entries[this.entries.length - 1].hash ?? GENESIS_HASH
        : GENESIS_HASH;

    const hash = this.calculateHash({
      timestamp,
      actor: params.actor,
      action: params.action,
      resource: params.resource,
      details: params.details,
      previousHash,
    });

    const entry: AuditLogEntry = {
      ...params,
      id,
      timestamp,
      hash,
      previousHash,
    };

    this.entries.push(entry);

    return entry;
  }

  /**
   * Retrieve paginated audit log entries with optional filters.
   */
  async getAuditLog(
    filters: {
      entityId?: string;
      actor?: string;
      resource?: string;
      dateRange?: { from: Date; to: Date };
      sensitivityLevel?: DataClassification;
    },
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<{ data: AuditLogEntry[]; total: number }> {
    const filtered = this.applyFilters(this.entries, filters);

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    return { data, total };
  }

  /**
   * Verify the integrity of the hash chain for a given entity and date range.
   * Walks entries chronologically, recalculates each hash, and verifies that
   * chain links are intact.
   */
  async verifyAuditChain(
    entityId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<{ valid: boolean; brokenAt?: string; checkedEntries: number }> {
    const filtered = this.entries.filter(
      (entry) =>
        entry.entityId === entityId &&
        entry.timestamp >= dateRange.from &&
        entry.timestamp <= dateRange.to,
    );

    // Entries are already ordered by timestamp (insertion order)
    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];

      // Recalculate the expected hash
      const expectedHash = this.calculateHash({
        timestamp: entry.timestamp,
        actor: entry.actor,
        action: entry.action,
        resource: entry.resource,
        details: entry.details,
        previousHash: entry.previousHash ?? GENESIS_HASH,
      });

      // Verify stored hash matches recalculated hash
      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          brokenAt: entry.id,
          checkedEntries: i + 1,
        };
      }

      // Verify chain link: previousHash must match the preceding entry's hash
      if (i > 0) {
        const previousEntry = filtered[i - 1];
        if (entry.previousHash !== previousEntry.hash) {
          return {
            valid: false,
            brokenAt: entry.id,
            checkedEntries: i + 1,
          };
        }
      }
    }

    return { valid: true, checkedEntries: filtered.length };
  }

  /**
   * Export audit log entries for compliance reporting.
   * Supports JSON and CSV output formats.
   */
  async exportAuditLog(
    entityId: string,
    dateRange: { from: Date; to: Date },
    format: 'JSON' | 'CSV',
  ): Promise<string> {
    const filtered = this.entries.filter(
      (entry) =>
        entry.entityId === entityId &&
        entry.timestamp >= dateRange.from &&
        entry.timestamp <= dateRange.to,
    );

    if (format === 'JSON') {
      return JSON.stringify(filtered);
    }

    // CSV export
    const headers = [
      'id',
      'timestamp',
      'actor',
      'actorId',
      'action',
      'resource',
      'resourceId',
      'entityId',
      'ipAddress',
      'userAgent',
      'requestMethod',
      'requestPath',
      'statusCode',
      'sensitivityLevel',
      'details',
      'hash',
      'previousHash',
    ];

    const rows = filtered.map((entry) =>
      [
        entry.id,
        entry.timestamp.toISOString(),
        entry.actor,
        entry.actorId ?? '',
        entry.action,
        entry.resource,
        entry.resourceId,
        entry.entityId,
        entry.ipAddress ?? '',
        entry.userAgent ?? '',
        entry.requestMethod,
        entry.requestPath,
        String(entry.statusCode),
        entry.sensitivityLevel,
        JSON.stringify(entry.details),
        entry.hash ?? '',
        entry.previousHash ?? '',
      ]
        .map(escapeCsvValue)
        .join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Calculate a SHA-256 hash over the canonical set of entry fields.
   */
  private calculateHash(payload: {
    timestamp: Date;
    actor: string;
    action: string;
    resource: string;
    details: Record<string, unknown>;
    previousHash: string;
  }): string {
    const serialized = JSON.stringify({
      timestamp: payload.timestamp,
      actor: payload.actor,
      action: payload.action,
      resource: payload.resource,
      details: payload.details,
      previousHash: payload.previousHash,
    });

    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Apply the provided filters to a list of audit entries.
   */
  private applyFilters(
    entries: AuditLogEntry[],
    filters: {
      entityId?: string;
      actor?: string;
      resource?: string;
      dateRange?: { from: Date; to: Date };
      sensitivityLevel?: DataClassification;
    },
  ): AuditLogEntry[] {
    return entries.filter((entry) => {
      if (filters.entityId && entry.entityId !== filters.entityId) {
        return false;
      }
      if (filters.actor && entry.actor !== filters.actor) {
        return false;
      }
      if (filters.resource && entry.resource !== filters.resource) {
        return false;
      }
      if (filters.dateRange) {
        if (
          entry.timestamp < filters.dateRange.from ||
          entry.timestamp > filters.dateRange.to
        ) {
          return false;
        }
      }
      if (
        filters.sensitivityLevel &&
        entry.sensitivityLevel !== filters.sensitivityLevel
      ) {
        return false;
      }
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const auditService = new AuditService();
