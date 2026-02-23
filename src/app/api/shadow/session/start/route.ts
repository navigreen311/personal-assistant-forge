import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

const StartSessionSchema = z.object({
  channel: z.enum(['web', 'phone', 'mobile']),
  entityId: z.string().min(1).optional(),
  currentPage: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = StartSessionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const voiceSession = await sessionManager.startSession({
        userId: session.userId,
        channel: parsed.data.channel,
        entityId: parsed.data.entityId ?? session.activeEntityId,
        currentPage: parsed.data.currentPage,
      });

      return success(voiceSession, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session';
      return error('SESSION_START_FAILED', message, 500);
    }
  });
}
