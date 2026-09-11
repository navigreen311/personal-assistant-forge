import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

const ResumeSchema = z.object({
  channel: z.enum(['web', 'phone', 'mobile']).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const { id } = await params;

      // Parse body — may be empty if no channel override
      let channel: string | undefined;
      try {
        const body = await req.json();
        const parsed = ResumeSchema.safeParse(body);
        if (parsed.success) {
          channel = parsed.data.channel;
        }
      } catch {
        // Empty body is fine — no channel override
      }

      // P-41: the scope IS the ownership check. See session-store.ts.
      const sessions = sessionManager.forUser(session.userId);

      const voiceSession = await sessions.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }

      const updated = await sessions.resumeSession(id, channel);
      return success(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume session';
      return error('RESUME_FAILED', message, 500);
    }
  });
}
