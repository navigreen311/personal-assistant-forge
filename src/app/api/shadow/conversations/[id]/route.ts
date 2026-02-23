import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // Verify session ownership
      const voiceSession = await sessionManager.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Conversation not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this conversation', 403);
      }

      // Fetch all related data in parallel
      const [messages, outcome, consentReceipts, entityRecord] = await Promise.all([
        // Full message transcript with timestamps
        prisma.shadowMessage.findMany({
          where: { sessionId: id },
          orderBy: { createdAt: 'asc' },
        }),
        // Structured outcome
        prisma.shadowSessionOutcome.findUnique({
          where: { sessionId: id },
        }),
        // Consent receipts for the session
        prisma.shadowConsentReceipt.findMany({
          where: { sessionId: id },
          orderBy: { executedAt: 'asc' },
        }),
        // Entity name lookup (if entityId exists on the session)
        voiceSession.activeEntityId
          ? prisma.entity.findUnique({
              where: { id: voiceSession.activeEntityId },
              select: { id: true, name: true },
            })
          : Promise.resolve(null),
      ]);

      // Count actions (messages with non-empty toolsUsed)
      const actionsCount = messages.filter(
        (m) => Array.isArray(m.toolsUsed) && (m.toolsUsed as unknown[]).length > 0,
      ).length;

      return success({
        ...voiceSession,
        entityName: entityRecord?.name ?? null,
        actionsCount,
        messages: messages.map((m) => ({
          id: m.id,
          sessionId: m.sessionId,
          role: m.role,
          content: m.content,
          contentType: m.contentType,
          intent: m.intent,
          toolsUsed: m.toolsUsed,
          actionsTaken: m.actionsTaken,
          audioUrl: m.audioUrl,
          channel: m.channel,
          confidence: m.confidence,
          latencyMs: m.latencyMs,
          telemetry: m.telemetry,
          createdAt: m.createdAt,
        })),
        outcome: outcome ?? null,
        consentReceipts: consentReceipts.map((cr) => ({
          id: cr.id,
          sessionId: cr.sessionId,
          messageId: cr.messageId,
          actionType: cr.actionType,
          actionDescription: cr.actionDescription,
          triggerSource: cr.triggerSource,
          triggerReferenceType: cr.triggerReferenceType,
          triggerReferenceId: cr.triggerReferenceId,
          reasoning: cr.reasoning,
          sourcesCited: cr.sourcesCited,
          confirmationLevel: cr.confirmationLevel,
          confirmationMethod: cr.confirmationMethod,
          blastRadius: cr.blastRadius,
          affectedCount: cr.affectedCount,
          financialImpact: cr.financialImpact,
          reversible: cr.reversible,
          rollbackPath: cr.rollbackPath,
          aiCost: cr.aiCost,
          telephonyCost: cr.telephonyCost,
          entityId: cr.entityId,
          executedAt: cr.executedAt,
          rolledBackAt: cr.rolledBackAt,
          rolledBackBy: cr.rolledBackBy,
        })),
        actions: consentReceipts.map((cr) => ({
          id: cr.id,
          actionType: cr.actionType,
          actionDescription: cr.actionDescription,
          confirmationLevel: cr.confirmationLevel,
          confirmationMethod: cr.confirmationMethod,
          blastRadius: cr.blastRadius,
          reversible: cr.reversible,
          executedAt: cr.executedAt,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get conversation';
      return error('GET_FAILED', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // Verify session ownership
      const voiceSession = await sessionManager.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Conversation not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this conversation', 403);
      }

      await sessionManager.deleteSession(id);

      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete conversation';
      return error('DELETE_FAILED', message, 500);
    }
  });
}
