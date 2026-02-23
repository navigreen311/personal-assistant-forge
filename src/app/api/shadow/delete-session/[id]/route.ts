import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { gdprService } from '@/modules/shadow/compliance/gdpr-export';
import { prisma } from '@/lib/db';

/**
 * POST /api/shadow/delete-session/[id]
 * Delete a single session and all its associated data.
 * Verifies that the session belongs to the authenticated user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id: sessionId } = await params;

      // Verify ownership
      const voiceSession = await prisma.shadowVoiceSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });

      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }

      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not own this session', 403);
      }

      await gdprService.deleteSession(sessionId);
      return success({ deleted: true, sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('DELETE_SESSION_FAILED', message, 500);
    }
  });
}
