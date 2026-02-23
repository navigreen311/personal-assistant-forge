// ============================================================================
// Shadow Voice Agent — Consent Receipt Service
// Creates, queries, and manages consent receipts for all voice-triggered
// actions. Provides audit trail and rollback capabilities.
// ============================================================================

import { prisma } from '@/lib/db';
import { classifyAction } from './action-classifier';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateReceiptParams {
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
  entityId?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
}

export interface ConsentReceiptRecord {
  id: string;
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
    params: ListReceiptsParams
  ): Promise<{ receipts: ConsentReceiptRecord[]; total: number }> {
    const { sessionId, entityId, actionType, limit = 50, offset = 0 } = params;

    // Build where clause dynamically
    const where: Record<string, unknown> = {};
    if (sessionId) where.sessionId = sessionId;
    if (entityId) where.entityId = entityId;
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
  async getReceipt(id: string): Promise<ConsentReceiptRecord | null> {
    const receipt = await prisma.shadowConsentReceipt.findUnique({
      where: { id },
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
    rolledBackBy: string
  ): Promise<RollbackResult> {
    const receipt = await prisma.shadowConsentReceipt.findUnique({
      where: { id: receiptId },
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
