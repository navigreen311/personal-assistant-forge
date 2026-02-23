import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // Verify session ownership
      const voiceSession = await sessionManager.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this session', 403);
      }

      const ended = await sessionManager.endSession(id);

      // Fetch the outcome summary if it exists
      const outcome = await prisma.shadowSessionOutcome.findUnique({
        where: { sessionId: id },
      });

      return success({
        ...ended,
        outcome: outcome ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end session';
      return error('END_FAILED', message, 500);
    }
  });
}
