// ============================================================================
// Audit Service — Tamper-Proof Audit Logging with Hash Chain Verification
// Worker 15: Security, Privacy & Compliance
//
// P-10 / T-002 — PERSISTED. Previously `private readonly entries: AuditLogEntry[]`.
//
// The audit brief said "persist the hash-chained audit log". P-00 correction C3
// established the harder truth: `logAuditEntry` had four callers, all inside
// `src/shared/middleware/{security,compliance}.ts`, and those middlewares had
// zero consumers. There were no audit records under ANY code path — the array
// was not a stale store, it was an empty one. Persisting alone would have
// shipped a table that stayed empty forever, which is strictly worse than no
// audit log at all: an empty table reads as "nothing happened".
//
// So this file is only half of T-002. The other half is
// `src/modules/security/audit-wiring.ts`, which puts `logAuditEntry` on the
// request path of real routes.
//
// TWO CORRECTNESS CHANGES CAME OUT OF PERSISTING IT
//
// 1. THE CHAIN IS NOW PER-ENTITY, not global.
//    `verifyAuditChain(entityId, range)` filters to one entity and then asserts
//    `entry.previousHash === previous.hash`. Against a single global chain that
//    assertion is FALSE whenever two entities interleave — which is every real
//    deployment. The in-memory version was never exercised with interleaved
//    entities, so nothing caught it. Chaining per entity makes the verifier
//    correct by construction, and it means one tenant's rows are never needed
//    to reason about another's.
//
// 2. THE TAIL READ AND THE INSERT ARE SERIALISED.
//    Two concurrent requests for the same entity would otherwise both read the
//    same tail and both write `previousHash = X`, forking the chain — and a
//    forked chain verifies as BROKEN, i.e. ordinary concurrency would be
//    indistinguishable from tampering. `pg_advisory_xact_lock` keyed on the
//    entityId makes the read-modify-write atomic. The lock serialises entry to
//    the section; it is the surrounding ReadCommitted transaction (Prisma's
//    default on Postgres) that lets each waiter see the previous writer's row.
// ============================================================================

import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AuditLogEntry,
  DataClassification,
} from '@/modules/security/types';
import { generateJSON } from '@/lib/ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;
const GENESIS_HASH = '0';

/** A row as Prisma returns it, before it is mapped onto the domain type. */
type AuditRow = {
  id: string;
  timestamp: Date;
  actor: string;
  actorId: string | null;
  action: string;
  resource: string;
  resourceId: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string;
  requestPath: string;
  statusCode: number;
  sensitivityLevel: string;
  details: Prisma.JsonValue;
  hash: string | null;
  previousHash: string | null;
};

/**
 * Map a database row onto the domain type.
 *
 * Nullable columns become optional properties: the rest of the module (and the
 * CSV export) was written against `actorId?: string`, not `string | null`.
 */
function toEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    actor: row.actor,
    actorId: row.actorId ?? undefined,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    entityId: row.entityId,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    requestMethod: row.requestMethod,
    requestPath: row.requestPath,
    statusCode: row.statusCode,
    sensitivityLevel: row.sensitivityLevel as DataClassification,
    details: (row.details ?? {}) as Record<string, unknown>,
    hash: row.hash ?? undefined,
    previousHash: row.previousHash ?? undefined,
  };
}

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
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a tamper-proof audit log entry.
   *
   * Calculates a SHA-256 hash over the canonical fields and chains it to the
   * previous entry FOR THE SAME ENTITY, then writes the row.
   *
   * The tail read and the insert happen inside one transaction holding an
   * advisory lock keyed on the entityId, so two concurrent writers for one
   * entity cannot both chain onto the same predecessor.
   */
  async logAuditEntry(
    params: Omit<AuditLogEntry, 'id' | 'timestamp' | 'hash' | 'previousHash'>,
  ): Promise<AuditLogEntry> {
    const timestamp = new Date();

    const row = await prisma.$transaction(async (tx) => {
      // Serialise writers for this entity. Released when the transaction ends.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.entityId})::bigint)`;

      const tail = await tx.auditLogEntry.findFirst({
        where: { entityId: params.entityId },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        select: { hash: true },
      });

      const previousHash = tail?.hash ?? GENESIS_HASH;

      const hash = this.calculateHash({
        timestamp,
        actor: params.actor,
        action: params.action,
        resource: params.resource,
        details: params.details,
        previousHash,
      });

      return tx.auditLogEntry.create({
        data: {
          timestamp,
          actor: params.actor,
          actorId: params.actorId ?? null,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          entityId: params.entityId,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          requestMethod: params.requestMethod,
          requestPath: params.requestPath,
          statusCode: params.statusCode,
          sensitivityLevel: params.sensitivityLevel,
          details: (params.details ?? {}) as Prisma.InputJsonValue,
          hash,
          previousHash,
        },
      });
    });

    return toEntry(row as AuditRow);
  }

  /**
   * Retrieve paginated audit log entries with optional filters.
   *
   * `entityId` is applied like any other filter here because this method is
   * internal to the service; the ROUTE is what proves the caller owns the
   * entity, and it passes a VerifiedEntityId. See `audit-wiring.ts`.
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
    const where = this.buildWhere(filters);

    const total = await prisma.auditLogEntry.count({ where });
    const rows = (await prisma.auditLogEntry.findMany({
      where,
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    })) as AuditRow[];

    return { data: rows.map(toEntry), total };
  }

  /**
   * Verify the integrity of the hash chain for a given entity and date range.
   * Walks entries chronologically, recalculates each hash, and verifies that
   * chain links are intact.
   *
   * Recalculation now reads the STORED row. Before persistence the only way to
   * simulate tampering in a test was to mutate the object the service had
   * handed back — which "worked" solely because it was the same array element.
   * A row in Postgres has to actually be edited, which is the real threat.
   */
  async verifyAuditChain(
    entityId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<{ valid: boolean; brokenAt?: string; checkedEntries: number }> {
    const filtered = await this.entriesInWindow(entityId, dateRange);

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
    const filtered = await this.entriesInWindow(entityId, dateRange);

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

  /**
   * AI-powered anomaly detection for audit trail analysis.
   * Analyzes recent audit entries for unusual patterns.
   */
  async analyzeAuditTrail(
    entityId: string,
    timeWindow: { from: Date; to: Date },
  ): Promise<{
    anomalies: Array<{ description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; events: string[] }>;
    summary: string;
    riskScore: number;
  }> {
    const filtered = await this.entriesInWindow(entityId, timeWindow);

    if (filtered.length === 0) {
      return { anomalies: [], summary: 'No audit entries in the specified time window.', riskScore: 0 };
    }

    try {
      const entrySummaries = filtered.slice(0, 100).map((e) => ({
        timestamp: e.timestamp.toISOString(),
        actor: e.actor,
        action: e.action,
        resource: e.resource,
        statusCode: e.statusCode,
        ipAddress: e.ipAddress,
      }));

      const result = await generateJSON<{
        anomalies: Array<{ description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; eventIndices: number[] }>;
        summary: string;
        riskScore: number;
      }>(`Analyze these audit log entries for anomalous patterns.

Entries: ${JSON.stringify(entrySummaries)}

Look for:
- Unusual access patterns (off-hours access, rapid successive actions)
- Privilege escalation attempts
- Bulk data operations (mass reads, deletes, exports)
- Failed access attempts followed by successful ones
- Actions from unusual IP addresses
- Sensitive resource access patterns

Return JSON with:
- anomalies: array of {description, severity (LOW/MEDIUM/HIGH), eventIndices (indices of related entries)}
- summary: brief overall assessment
- riskScore: 0-100 overall risk score`, {
        maxTokens: 1024,
        temperature: 0.3,
        system: 'You are a security operations analyst specializing in audit log analysis. Identify genuine security anomalies while minimizing false positives.',
      });

      return {
        anomalies: result.anomalies.map((a) => ({
          description: a.description,
          severity: a.severity,
          events: (a.eventIndices ?? []).map((i) => filtered[i]?.id).filter(Boolean) as string[],
        })),
        summary: result.summary,
        riskScore: Math.min(Math.max(result.riskScore, 0), 100),
      };
    } catch {
      return { anomalies: [], summary: 'AI analysis unavailable.', riskScore: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Every entry for one entity inside a window, oldest first. */
  private async entriesInWindow(
    entityId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<AuditLogEntry[]> {
    const rows = (await prisma.auditLogEntry.findMany({
      where: { entityId, timestamp: { gte: dateRange.from, lte: dateRange.to } },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    })) as AuditRow[];

    return rows.map(toEntry);
  }

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
   * Translate the filter bag into a Prisma WHERE.
   *
   * Previously an in-memory `Array.filter`. Same semantics, applied in the
   * database so pagination counts the whole table rather than one process's
   * slice of it.
   */
  private buildWhere(filters: {
    entityId?: string;
    actor?: string;
    resource?: string;
    dateRange?: { from: Date; to: Date };
    sensitivityLevel?: DataClassification;
  }): Prisma.AuditLogEntryWhereInput {
    const where: Prisma.AuditLogEntryWhereInput = {};

    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.actor) where.actor = filters.actor;
    if (filters.resource) where.resource = filters.resource;
    if (filters.sensitivityLevel) where.sensitivityLevel = filters.sensitivityLevel;
    if (filters.dateRange) {
      where.timestamp = { gte: filters.dateRange.from, lte: filters.dateRange.to };
    }

    return where;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const auditService = new AuditService();
