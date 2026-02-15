// ============================================================================
// Retention Policy Engine
// Manages data retention policies: creation, scheduling, execution (delete,
// archive, anonymize), legal-hold awareness, and default policy provisioning.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
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
function getPrismaDelegate(modelName: PrismaModelName) {
  const mapping: Record<PrismaModelName, typeof prisma.message> = {
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
// RetentionService
// ---------------------------------------------------------------------------

export class RetentionService {
  private policies: Map<string, RetentionPolicy> = new Map();

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  createPolicy(
    params: Omit<RetentionPolicy, 'id' | 'createdAt' | 'lastExecuted' | 'nextExecution'>,
  ): RetentionPolicy {
    const now = new Date();
    const nextExecution = new Date(now.getTime() + params.retentionDays * 24 * 60 * 60 * 1000);

    const policy: RetentionPolicy = {
      ...params,
      id: uuidv4(),
      createdAt: now,
      lastExecuted: undefined,
      nextExecution,
    };

    this.policies.set(policy.id, policy);
    return policy;
  }

  getPolicy(policyId: string): RetentionPolicy | null {
    return this.policies.get(policyId) ?? null;
  }

  /**
   * Lists global policies (no entityId) plus any policies scoped to the given
   * entity. When no entityId is provided every policy is returned.
   */
  listPolicies(entityId?: string): RetentionPolicy[] {
    const all = Array.from(this.policies.values());

    if (entityId === undefined) {
      return all;
    }

    return all.filter(
      (p) => p.entityId === undefined || p.entityId === entityId,
    );
  }

  updatePolicy(
    policyId: string,
    updates: Partial<RetentionPolicy>,
  ): RetentionPolicy {
    const existing = this.policies.get(policyId);
    if (!existing) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    const updated: RetentionPolicy = { ...existing, ...updates, id: existing.id };
    this.policies.set(policyId, updated);
    return updated;
  }

  deletePolicy(policyId: string): void {
    if (!this.policies.has(policyId)) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }
    this.policies.delete(policyId);
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single retention policy: query stale records, honour legal
   * holds, and apply the configured action (DELETE / ARCHIVE / ANONYMIZE).
   */
  async executePolicy(policyId: string): Promise<RetentionExecutionResult> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

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
      const records: Array<{ id: string }> = await (delegate as typeof prisma.message)
        .findMany({
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
        this.markPolicyExecuted(policy);
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

    this.markPolicyExecuted(policy);
    return result;
  }

  /**
   * Run every active policy whose nextExecution is in the past (or now).
   */
  async executeAllDuePolicies(): Promise<RetentionExecutionResult[]> {
    const now = new Date();
    const due = Array.from(this.policies.values()).filter(
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
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

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

    const records: Array<{ id: string; createdAt: Date }> = await (
      delegate as typeof prisma.message
    ).findMany({
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
  createDefaultPolicies(entityId: string): RetentionPolicy[] {
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

    return defaults.map((d) => this.createPolicy(d));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private markPolicyExecuted(policy: RetentionPolicy): void {
    const now = new Date();
    const nextExecution = new Date(
      now.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000,
    );
    this.updatePolicy(policy.id, { lastExecuted: now, nextExecution });
  }

  /**
   * Hard-delete eligible records.
   */
  private async applyDelete(
    delegate: ReturnType<typeof getPrismaDelegate>,
    ids: string[],
    result: RetentionExecutionResult,
  ): Promise<void> {
    try {
      const { count } = await (delegate as typeof prisma.message).deleteMany({
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
    delegate: ReturnType<typeof getPrismaDelegate>,
    ids: string[],
    result: RetentionExecutionResult,
  ): Promise<void> {
    try {
      const { count } = await (delegate as typeof prisma.message).updateMany({
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
    delegate: ReturnType<typeof getPrismaDelegate>,
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
      const { count } = await (delegate as typeof prisma.message).updateMany({
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
