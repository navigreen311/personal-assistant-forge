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

      // Fetch all messages for the session
      const messages = await prisma.shadowMessage.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: 'asc' },
      });

      // Fetch the outcome if it exists
      const outcome = await prisma.shadowSessionOutcome.findUnique({
        where: { sessionId: id },
      });

      return success({
        ...voiceSession,
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
