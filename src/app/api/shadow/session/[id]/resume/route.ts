import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

const ResumeSchema = z.object({
  channel: z.enum(['web', 'phone', 'mobile']).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (req, session) => {
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

      // Verify session ownership
      const voiceSession = await sessionManager.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this session', 403);
      }

      const updated = await sessionManager.resumeSession(id, channel);
      return success(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume session';
      return error('RESUME_FAILED', message, 500);
    }
  });
}
