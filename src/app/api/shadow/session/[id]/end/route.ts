import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRole(request, ['owner', 'admin', 'member'], async (_req, session) => {
    try {
      const { id } = await params;

      // P-41: the scope IS the ownership check. `forUser` merges the
      // authenticated user into the where clause, so a session belonging to
      // anybody else reads as a session that does not exist.
      const sessions = sessionManager.forUser(session.userId);

      const voiceSession = await sessions.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }

      const ended = await sessions.endSession(id);

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
