// ============================================================================
// Shadow Voice Agent — Consent Receipt Service
// Creates, queries, and manages consent receipts for all voice-triggered
// actions. Provides audit trail and rollback capabilities.
// ============================================================================

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import { classifyAction } from './action-classifier';

// ============================================================================
// P-34 — READING AND ROLLING BACK A RECEIPT ARE ENTITY-SCOPED OPERATIONS
// ============================================================================
//
// Three of the five routes P-20's fuzz recorded as returning another tenant's
// rows are backed by this file, and one of them is a WRITE:
//
//   GET  /api/shadow/receipts        `listReceipts`, with `entityId` read off
//                                    the caller's own query string.
//   GET  /api/shadow/receipts/[id]   `getReceipt(id)`, unscoped.
//   POST /api/shadow/receipts/[id]/rollback
//                                    `rollbackAction(id, session.userId)`,
//                                    unscoped -- so an authenticated owner or
//                                    admin of ANY entity could UNDO another
//                                    tenant's consented action, and the failure
//                                    message quoted the action it refused to
//                                    touch ("Action \"X\" is not reversible"),
//                                    so even the refusal disclosed the record.
//
// A consent receipt is the record of a decision a person authorised a voice
// agent to take. Reading someone else's is not cosmetic and reversing one is
// not recoverable. So the entity is a required, branded `VerifiedEntityId`
// argument on all three: a route that has not been through `withEntityScope`
// cannot call them, and the failure is `tsc` rather than review.
//
// NULL-ENTITY RECEIPTS. `ShadowConsentReceipt.entityId` is nullable, and
// `core.ts` writes `context.activeEntity?.id ?? null`, so receipts taken with
// no entity in scope exist. Under this scoping they are addressable from NO
// tenant rather than from every tenant. That is the safe direction and it is
// deliberate: a receipt attributable to no entity cannot be shown to one
// without guessing which, and guessing is what this file is being fixed for.
// ============================================================================
// MIGRATION WINDOW 02 — `userId`. IVAN CALLS THIS A BUG FIX, NOT A FEATURE.
// ============================================================================
//
//   *"a receipt you can't attribute to a user defeats the entire audit trail."*
//
// The paragraph above is where the bug was visible and nobody read it that way.
// P-34 wrote it about TENANCY -- a null-entity receipt is addressable from no
// tenant, which is the safe direction and is still true. P-17 then made
// receipts outlive their session, correctly, because v3 Addition 9.3 retains
// them for regulatory compliance while the transcript is erased. Put together:
//
//   sessionId  -- nulled by `ShadowConsentReceipt_sessionId_fkey`
//                 (ON DELETE SET NULL) the moment the session is cleaned up or
//                 a GDPR erasure removes it;
//   entityId   -- `core.ts` writes `context.activeEntity?.id ?? null`.
//
// ...were the ONLY two links a receipt had to a person, and both are nullable.
// A retained receipt with neither named nobody. It could not be exported under
// Article 15, could not be listed, and could not be produced for the person it
// is about -- while still being kept for seven years under Article 17(3)(b).
// Kept, and unreadable by its subject, which is the worst of both.
//
// So `userId` is written here, by the one permitted writer (eslint's P-17 block
// makes a direct `prisma.shadowConsentReceipt.create` a lint error), and it is
// read by `gdpr-export.exportUserData` -- the Article 15 path, which is the
// code that acts on the attribution. `tests/db/migration-window-02.test.ts`
// deletes the session and asserts the receipt still names its user, from a
// second `PrismaClient`, after a restart.
//
// It does not replace the entity scoping above and does not widen it:
// `listReceipts`, `getReceipt` and `rollbackAction` still take a
// `VerifiedEntityId` and still filter on `entityId`. Attribution answers "whose
// receipt is this"; tenancy answers "which tenant may read it". Those are
// different questions and conflating them is what P-34 was fixing.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateReceiptParams {
  /**
   * The `User.id` who authorised the action. Migration window 02.
   *
   * Optional on the params rather than required, because a receipt can
   * legitimately have no user in scope -- `recording-consent` records a
   * CONTACT's decision about being recorded. A null now means "no user was in
   * scope", which is a fact; before the column it was indistinguishable from
   * "the session that named the user has been deleted".
   */
  userId?: string;
  sessionId?: string;
  messageId?: string;
  actionType: string;
  actionDescription: string;
  triggerSource: string;
  triggerReferenceType?: string;
  triggerReferenceId?: string;
  reasoning?: string;
  sourcesCited?: string[];
  confirmationMethod?: string;
  affectedCount?: number;
  financialImpact?: number;
  rollbackPath?: string;
  aiCost?: number;
  telephonyCost?: number;
  entityId?: string;
}

export interface ListReceiptsParams {
  sessionId?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
}

export interface ConsentReceiptRecord {
  id: string;
  /** Who authorised the action. Survives the session being deleted. */
  userId: string | null;
  sessionId: string | null;
  messageId: string | null;
  actionType: string;
  actionDescription: string;
  triggerSource: string;
  triggerReferenceType: string | null;
  triggerReferenceId: string | null;
  reasoning: string | null;
  sourcesCited: unknown;
  confirmationLevel: string;
  confirmationMethod: string | null;
  blastRadius: string;
  affectedCount: number;
  financialImpact: number;
  reversible: boolean;
  rollbackPath: string | null;
  aiCost: number;
  telephonyCost: number;
  entityId: string | null;
  executedAt: Date;
  rolledBackAt: Date | null;
  rolledBackBy: string | null;
}

export interface RollbackResult {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// ConsentReceiptService
// ---------------------------------------------------------------------------

export class ConsentReceiptService {
  /**
   * Create a new consent receipt for a voice-triggered action.
   * Automatically enriches with action classification data.
   */
  async createReceipt(params: CreateReceiptParams): Promise<ConsentReceiptRecord> {
    // Get classification for the action type
    const classification = classifyAction(params.actionType);

    const receipt = await prisma.shadowConsentReceipt.create({
      data: {
        // Window 02. Written FIRST, and from the caller's own authenticated
        // identity rather than resolved back through `sessionId`: resolving it
        // through the session would reproduce the defect -- the attribution
        // would only exist for as long as the thing it was derived from.
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
        messageId: params.messageId ?? null,
        actionType: params.actionType,
        actionDescription: params.actionDescription,
        triggerSource: params.triggerSource,
        triggerReferenceType: params.triggerReferenceType ?? null,
        triggerReferenceId: params.triggerReferenceId ?? null,
        reasoning: params.reasoning ?? null,
        sourcesCited: params.sourcesCited ?? [],
        confirmationLevel: classification.confirmationLevel,
        confirmationMethod: params.confirmationMethod ?? null,
        blastRadius: classification.blastRadius,
        affectedCount: params.affectedCount ?? 0,
        financialImpact: params.financialImpact ?? 0,
        reversible: classification.reversible,
        rollbackPath: params.rollbackPath ?? null,
        aiCost: params.aiCost ?? 0,
        telephonyCost: params.telephonyCost ?? 0,
        entityId: params.entityId ?? null,
      },
    });

    return receipt as ConsentReceiptRecord;
  }

  /**
   * List consent receipts with optional filters and pagination.
   */
  async listReceipts(
    entityId: VerifiedEntityId,
    params: ListReceiptsParams = {}
  ): Promise<{ receipts: ConsentReceiptRecord[]; total: number }> {
    const { sessionId, actionType, limit = 50, offset = 0 } = params;

    // `entityId` is the argument, never a filter the caller may omit. The
    // remaining fields still narrow, and cannot widen.
    const where: Record<string, unknown> = { entityId };
    if (sessionId) where.sessionId = sessionId;
    if (actionType) where.actionType = actionType;

    const [receipts, total] = await Promise.all([
      prisma.shadowConsentReceipt.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.shadowConsentReceipt.count({ where }),
    ]);

    return {
      receipts: receipts as ConsentReceiptRecord[],
      total,
    };
  }

  /**
   * Get a single consent receipt by ID.
   * Returns null if not found.
   */
  async getReceipt(
    id: string,
    entityId: VerifiedEntityId
  ): Promise<ConsentReceiptRecord | null> {
    const receipt = await prisma.shadowConsentReceipt.findFirst({
      where: { id, entityId },
    });

    return receipt as ConsentReceiptRecord | null;
  }

  /**
   * Attempt to rollback an action associated with a consent receipt.
   *
   * Only reversible actions can be rolled back. The receipt is updated
   * with the rollback timestamp and the ID of the person who initiated it.
   */
  async rollbackAction(
    receiptId: string,
    rolledBackBy: string,
    entityId: VerifiedEntityId
  ): Promise<RollbackResult> {
    const receipt = await prisma.shadowConsentReceipt.findFirst({
      where: { id: receiptId, entityId },
    });

    if (!receipt) {
      return {
        success: false,
        message: 'Consent receipt not found',
      };
    }

    if (!receipt.reversible) {
      return {
        success: false,
        message: `Action "${receipt.actionType}" is not reversible. ${receipt.rollbackPath ? `Manual rollback instructions: ${receipt.rollbackPath}` : 'No rollback path available.'}`,
      };
    }

    if (receipt.rolledBackAt) {
      return {
        success: false,
        message: `Action was already rolled back at ${receipt.rolledBackAt.toISOString()} by ${receipt.rolledBackBy}`,
      };
    }

    // Mark as rolled back
    await prisma.shadowConsentReceipt.update({
      where: { id: receiptId },
      data: {
        rolledBackAt: new Date(),
        rolledBackBy,
      },
    });

    // In production, this would also execute the actual rollback logic
    // based on the rollbackPath (e.g., undo a task completion, restore data, etc.)

    return {
      success: true,
      message: `Action "${receipt.actionType}" has been rolled back successfully`,
    };
  }

  /**
   * Get rollback-eligible receipts for a session.
   * Returns only receipts that are reversible and not yet rolled back.
   */
  async getRollbackEligible(sessionId: string): Promise<ConsentReceiptRecord[]> {
    const receipts = await prisma.shadowConsentReceipt.findMany({
      where: {
        sessionId,
        reversible: true,
        rolledBackAt: null,
      },
      orderBy: { executedAt: 'desc' },
    });

    return receipts as ConsentReceiptRecord[];
  }

  /**
   * Get a summary of consent receipts for a session.
   * Useful for session outcome reports.
   */
  async getSessionSummary(sessionId: string): Promise<{
    totalActions: number;
    reversibleActions: number;
    rolledBackActions: number;
    totalAiCost: number;
    totalTelephonyCost: number;
    blastRadiusDistribution: Record<string, number>;
    confirmationLevelDistribution: Record<string, number>;
  }> {
    const receipts = await prisma.shadowConsentReceipt.findMany({
      where: { sessionId },
    });

    const blastRadiusDistribution: Record<string, number> = {};
    const confirmationLevelDistribution: Record<string, number> = {};

    let totalAiCost = 0;
    let totalTelephonyCost = 0;
    let reversibleActions = 0;
    let rolledBackActions = 0;

    for (const receipt of receipts) {
      totalAiCost += receipt.aiCost;
      totalTelephonyCost += receipt.telephonyCost;

      if (receipt.reversible) reversibleActions++;
      if (receipt.rolledBackAt) rolledBackActions++;

      blastRadiusDistribution[receipt.blastRadius] =
        (blastRadiusDistribution[receipt.blastRadius] ?? 0) + 1;

      confirmationLevelDistribution[receipt.confirmationLevel] =
        (confirmationLevelDistribution[receipt.confirmationLevel] ?? 0) + 1;
    }

    return {
      totalActions: receipts.length,
      reversibleActions,
      rolledBackActions,
      totalAiCost,
      totalTelephonyCost,
      blastRadiusDistribution,
      confirmationLevelDistribution,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const consentReceiptService = new ConsentReceiptService();
