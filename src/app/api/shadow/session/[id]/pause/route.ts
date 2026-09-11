import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRole(request, ['owner', 'admin', 'member'], async (_req, session) => {
    try {
      const { id } = await params;

      // P-41: the scope IS the ownership check. See session-store.ts.
      const sessions = sessionManager.forUser(session.userId);

      const voiceSession = await sessions.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }

      const updated = await sessions.pauseSession(id);
      return success(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pause session';
      return error('PAUSE_FAILED', message, 500);
    }
  });
}
