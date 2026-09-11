import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

const HandoffSchema = z.object({
  channel: z.enum(['web', 'phone', 'mobile']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = HandoffSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // P-41: the scope IS the ownership check. See session-store.ts.
      const sessions = sessionManager.forUser(session.userId);

      const voiceSession = await sessions.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }

      const updated = await sessions.handoffChannel(id, parsed.data.channel);
      return success(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to handoff channel';
      return error('HANDOFF_FAILED', message, 500);
    }
  });
}
