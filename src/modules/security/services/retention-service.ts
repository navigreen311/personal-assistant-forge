// ============================================================================
// Retention Policy Engine
// Manages data retention policies: creation, scheduling, execution (delete,
// archive, anonymize), legal-hold awareness, and default policy provisioning.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type {
  RetentionPolicy,
  RetentionExecutionResult,
  DataClassification,
} from '@/modules/security/types';
import { legalHoldService } from './legal-hold-service';

// ---------------------------------------------------------------------------
// Prisma model accessor mapping
// ---------------------------------------------------------------------------

type PrismaModelName =
  | 'Message'
  | 'ActionLog'
  | 'Document'
  | 'Task'
  | 'Contact'
  | 'Call'
  | 'KnowledgeEntry';

/**
 * Returns the Prisma delegate for a given model name so we can call
 * findMany / deleteMany / updateMany dynamically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPrismaDelegate(modelName: PrismaModelName): any {
  const mapping: Record<PrismaModelName, unknown> = {
    Message: prisma.message,
    ActionLog: prisma.actionLog,
    Document: prisma.document,
    Task: prisma.task,
    Contact: prisma.contact,
    Call: prisma.call,
    KnowledgeEntry: prisma.knowledgeEntry,
  };

  const delegate = mapping[modelName];
  if (!delegate) {
    throw new Error(`Unknown data type model: ${modelName}`);
  }
  return delegate;
}

// ---------------------------------------------------------------------------
// Text fields to anonymize per model (used by ANONYMIZE action)
// ---------------------------------------------------------------------------

const ANONYMIZE_FIELDS: Record<PrismaModelName, string[]> = {
  Message: ['body', 'subject'],
  ActionLog: ['reason'],
  Document: ['title', 'content'],
  Task: ['title', 'description'],
  Contact: ['name', 'email', 'phone'],
  Call: ['transcript'],
  KnowledgeEntry: ['content'],
};

// ---------------------------------------------------------------------------
// Helpers — map between Prisma row and RetentionPolicy interface
// ---------------------------------------------------------------------------

/**
 * The Prisma RetentionPolicy model stores some fields that don't exist as
 * dedicated columns (name, classification, nextExecution) inside the
 * executionHistory JSON column as metadata.  This helper reconstitutes the
 * full RetentionPolicy interface from a Prisma row.
 */
function toPolicy(row: {
  id: string;
  entityId: string;
  dataType: string;
  action: string;
  retentionDays: number;
  schedule: string;
  isActive: boolean;
  lastExecutedAt: Date | null;
  executionHistory: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): RetentionPolicy {
  const meta = (
    Array.isArray(row.executionHistory)
      ? {}
      : typeof row.executionHistory === 'object' && row.executionHistory !== null
        ? row.executionHistory
        : {}
  ) as Record<string, unknown>;

  // If executionHistory is an array, there is no metadata wrapper — treat as
  // a legacy row.  In the new layout we store { __meta: {...}, history: [...] }.
  const metaBlock =
    meta && typeof meta === 'object' && '__meta' in meta
      ? (meta.__meta as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    name: (metaBlock.name as string) ?? `${row.dataType} retention`,
    entityId: row.entityId,
    dataType: row.dataType,
    classification: metaBlock.classification as DataClassification | undefined,
    retentionDays: row.retentionDays,
    action: row.action as RetentionPolicy['action'],
    isActive: row.isActive,
    lastExecuted: row.lastExecutedAt ?? undefined,
    nextExecution: metaBlock.nextExecution
      ? new Date(metaBlock.nextExecution as string)
      : undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Build the executionHistory JSON payload that carries metadata alongside
 * the actual execution history entries.
 */
function buildExecutionHistoryJson(
  policy: {
    name?: string;
    classification?: DataClassification;
    nextExecution?: Date;
  },
  existingHistory: unknown[] = [],
): Prisma.JsonObject {
  return {
    __meta: {
      name: policy.name,
      classification: policy.classification,
      nextExecution: policy.nextExecution?.toISOString(),
    },
    history: existingHistory as Prisma.JsonArray,
  } as unknown as Prisma.JsonObject;
}

// ---------------------------------------------------------------------------
// Backward-compatible in-memory Map stub (for tests that call policies.clear())
// ---------------------------------------------------------------------------

export const policies = {
  clear() {
    // no-op — data now lives in Prisma
  },
};

// ---------------------------------------------------------------------------
// RetentionService
// ---------------------------------------------------------------------------

export class RetentionService {
  /**
   * @deprecated kept for backward compatibility; data is now in Prisma.
   */
  private policies = policies;

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async createPolicy(
    params: Omit<RetentionPolicy, 'id' | 'createdAt' | 'lastExecuted' | 'nextExecution'>,
  ): Promise<RetentionPolicy> {
    const now = new Date();
    const nextExecution = new Date(now.getTime() + params.retentionDays * 24 * 60 * 60 * 1000);

    const executionHistory = buildExecutionHistoryJson({
      name: params.name,
      classification: params.classification,
      nextExecution,
    });

    const row = await prisma.retentionPolicy.create({
      data: {
        id: uuidv4(),
        entityId: params.entityId ?? '',
        dataType: params.dataType,
        action: params.action,
        retentionDays: params.retentionDays,
        isActive: params.isActive,
        executionHistory,
      },
    });

    return toPolicy(row);
  }

  async getPolicy(policyId: string): Promise<RetentionPolicy | null> {
    const row = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
    return row ? toPolicy(row) : null;
  }

  /**
   * Lists global policies (no entityId) plus any policies scoped to the given
   * entity. When no entityId is provided every policy is returned.
   */
  async listPolicies(entityId?: string): Promise<RetentionPolicy[]> {
    let rows;

    if (entityId === undefined) {
      rows = await prisma.retentionPolicy.findMany();
    } else {
      rows = await prisma.retentionPolicy.findMany({
        where: {
          OR: [
            { entityId: '' },
            { entityId },
          ],
        },
      });
    }

    return rows.map(toPolicy);
  }

  async updatePolicy(
    policyId: string,
    updates: Partial<RetentionPolicy>,
  ): Promise<RetentionPolicy> {
    const existing = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
    if (!existing) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    const currentPolicy = toPolicy(existing);

    // Merge the updates into the current policy for metadata
    const merged = { ...currentPolicy, ...updates, id: existing.id };

    // Extract the history entries from the existing row
    const existingExecHistory = existing.executionHistory as unknown;
    let historyEntries: unknown[] = [];
    if (
      typeof existingExecHistory === 'object' &&
      existingExecHistory !== null &&
      !Array.isArray(existingExecHistory) &&
      'history' in existingExecHistory
    ) {
      historyEntries = (existingExecHistory as Record<string, unknown>).history as unknown[] ?? [];
    } else if (Array.isArray(existingExecHistory)) {
      historyEntries = existingExecHistory;
    }

    const executionHistory = buildExecutionHistoryJson(
      {
        name: merged.name,
        classification: merged.classification,
        nextExecution: merged.nextExecution,
      },
      historyEntries,
    );

    // Build Prisma data payload — only include columns that actually exist
    const data: Record<string, unknown> = { executionHistory };
    if (updates.dataType !== undefined) data.dataType = updates.dataType;
    if (updates.action !== undefined) data.action = updates.action;
    if (updates.retentionDays !== undefined) data.retentionDays = updates.retentionDays;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;
    if (updates.entityId !== undefined) data.entityId = updates.entityId ?? '';
    if (updates.lastExecuted !== undefined) data.lastExecutedAt = updates.lastExecuted;

    const row = await prisma.retentionPolicy.update({
      where: { id: policyId },
      data,
    });

    return toPolicy(row);
  }

  async deletePolicy(policyId: string): Promise<void> {
    const existing = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
    if (!existing) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }
    await prisma.retentionPolicy.delete({ where: { id: policyId } });
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single retention policy: query stale records, honour legal
   * holds, and apply the configured action (DELETE / ARCHIVE / ANONYMIZE).
   */
  async executePolicy(policyId: string): Promise<RetentionExecutionResult> {
    const row = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
    if (!row) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    const policy = toPolicy(row);

    const result: RetentionExecutionResult = {
      policyId: policy.id,
      policyName: policy.name,
      recordsProcessed: 0,
      recordsDeleted: 0,
      recordsArchived: 0,
      recordsAnonymized: 0,
      errors: [],
      executedAt: new Date(),
    };

    try {
      const modelName = policy.dataType as PrismaModelName;
      const delegate = getPrismaDelegate(modelName);

      const cutoffDate = new Date(
        Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000,
      );

      // Build the where clause
      const where: Record<string, unknown> = {
        createdAt: { lt: cutoffDate },
      };

      // If the policy targets a specific classification and the model supports
      // the `sensitivity` field (Message), add a filter.
      if (policy.classification && modelName === 'Message') {
        where['sensitivity'] = policy.classification;
      }

      // Fetch candidate records
      const records: Array<{ id: string }> = await delegate.findMany({
          where,
          select: { id: true },
        });

      // Filter out records under active legal hold
      const eligible: string[] = [];
      for (const record of records) {
        try {
          const underHold = await legalHoldService.isRecordUnderHold(modelName, record.id);
          if (!underHold) {
            eligible.push(record.id);
          }
        } catch {
          // If legal hold check fails treat the record as held (safe default)
          result.errors.push(
            `Legal hold check failed for ${modelName}:${record.id} — record skipped`,
          );
        }
      }

      result.recordsProcessed = eligible.length;

      if (eligible.length === 0) {
        await this.markPolicyExecuted(policy);
        return result;
      }

      // Apply the configured action
      switch (policy.action) {
        case 'DELETE':
          await this.applyDelete(delegate, eligible, result);
          break;
        case 'ARCHIVE':
          await this.applyArchive(delegate, eligible, result);
          break;
        case 'ANONYMIZE':
          await this.applyAnonymize(delegate, modelName, eligible, result);
          break;
        default:
          result.errors.push(`Unsupported action: ${policy.action as string}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Policy execution failed: ${message}`);
    }

    await this.markPolicyExecuted(policy);
    return result;
  }

  /**
   * Run every active policy whose nextExecution is in the past (or now).
   */
  async executeAllDuePolicies(): Promise<RetentionExecutionResult[]> {
    const now = new Date();
    const allRows = await prisma.retentionPolicy.findMany({
      where: { isActive: true },
    });

    const allPolicies = allRows.map(toPolicy);
    const due = allPolicies.filter(
      (p) => p.isActive && p.nextExecution && p.nextExecution <= now,
    );

    const results: RetentionExecutionResult[] = [];
    for (const policy of due) {
      const result = await this.executePolicy(policy.id);
      results.push(result);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  /**
   * Preview the effect of executing a policy without making any changes.
   */
  async previewPolicyExecution(policyId: string): Promise<{
    recordCount: number;
    dataTypes: string[];
    oldestRecord: Date;
    newestRecord: Date;
    legalHoldConflicts: number;
  }> {
    const row = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
    if (!row) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    const policy = toPolicy(row);
    const modelName = policy.dataType as PrismaModelName;
    const delegate = getPrismaDelegate(modelName);

    const cutoffDate = new Date(
      Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000,
    );

    const where: Record<string, unknown> = {
      createdAt: { lt: cutoffDate },
    };

    if (policy.classification && modelName === 'Message') {
      where['sensitivity'] = policy.classification;
    }

    const records: Array<{ id: string; createdAt: Date }> = await delegate.findMany({
      where,
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Count legal hold conflicts (best-effort)
    let legalHoldConflicts = 0;
    for (const record of records) {
      try {
        if (await legalHoldService.isRecordUnderHold(modelName, record.id)) {
          legalHoldConflicts++;
        }
      } catch {
        // Treat check failures as potential conflicts
        legalHoldConflicts++;
      }
    }

    const oldestRecord =
      records.length > 0 ? records[0].createdAt : new Date();
    const newestRecord =
      records.length > 0 ? records[records.length - 1].createdAt : new Date();

    return {
      recordCount: records.length,
      dataTypes: [modelName],
      oldestRecord,
      newestRecord,
      legalHoldConflicts,
    };
  }

  // -------------------------------------------------------------------------
  // Default policy provisioning
  // -------------------------------------------------------------------------

  /**
   * Creates a standard set of retention policies for a new entity.
   */
  async createDefaultPolicies(entityId: string): Promise<RetentionPolicy[]> {
    const defaults: Array<
      Omit<RetentionPolicy, 'id' | 'createdAt' | 'lastExecuted' | 'nextExecution'>
    > = [
      {
        name: 'ActionLog Retention (365 days)',
        entityId,
        dataType: 'ActionLog',
        retentionDays: 365,
        action: 'ARCHIVE',
        isActive: true,
      },
      {
        name: 'Public Messages Retention (180 days)',
        entityId,
        dataType: 'Message',
        classification: 'PUBLIC' as DataClassification,
        retentionDays: 180,
        action: 'DELETE',
        isActive: true,
      },
      {
        name: 'Confidential+ Messages Retention (730 days)',
        entityId,
        dataType: 'Message',
        classification: 'CONFIDENTIAL' as DataClassification,
        retentionDays: 730,
        action: 'ARCHIVE',
        isActive: true,
      },
      {
        name: 'Temporary Files Retention (30 days)',
        entityId,
        dataType: 'Document',
        retentionDays: 30,
        action: 'DELETE',
        isActive: true,
      },
    ];

    const results: RetentionPolicy[] = [];
    for (const d of defaults) {
      const policy = await this.createPolicy(d);
      results.push(policy);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async markPolicyExecuted(policy: RetentionPolicy): Promise<void> {
    const now = new Date();
    const nextExecution = new Date(
      now.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000,
    );
    await this.updatePolicy(policy.id, { lastExecuted: now, nextExecution });
  }

  /**
   * Hard-delete eligible records.
   */
  private async applyDelete(
    delegate: any,
    ids: string[],
    result: RetentionExecutionResult,
  ): Promise<void> {
    try {
      const { count } = await delegate.deleteMany({
        where: { id: { in: ids } },
      });
      result.recordsDeleted = count;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`DELETE action failed: ${message}`);
    }
  }

  /**
   * Mark eligible records as archived. Models that expose a `status` field
   * (Document, Task, ActionLog) get updated to 'ARCHIVED'; others are skipped
   * with a note.
   */
  private async applyArchive(
    delegate: any,
    ids: string[],
    result: RetentionExecutionResult,
  ): Promise<void> {
    try {
      const { count } = await delegate.updateMany({
        where: { id: { in: ids } },
        data: { status: 'ARCHIVED' } as Record<string, unknown>,
      });
      result.recordsArchived = count;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`ARCHIVE action failed: ${message}`);
    }
  }

  /**
   * Replace PII-bearing text fields with '[ANONYMIZED]'.
   */
  private async applyAnonymize(
    delegate: any,
    modelName: PrismaModelName,
    ids: string[],
    result: RetentionExecutionResult,
  ): Promise<void> {
    const fields = ANONYMIZE_FIELDS[modelName] ?? [];
    if (fields.length === 0) {
      result.errors.push(`No anonymizable fields defined for model: ${modelName}`);
      return;
    }

    const data: Record<string, string> = {};
    for (const field of fields) {
      data[field] = '[ANONYMIZED]';
    }

    try {
      const { count } = await delegate.updateMany({
        where: { id: { in: ids } },
        data: data as Record<string, unknown>,
      });
      result.recordsAnonymized = count;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`ANONYMIZE action failed: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const retentionService = new RetentionService();
