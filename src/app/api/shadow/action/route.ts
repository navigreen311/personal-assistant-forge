import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

const ActionResponseSchema = z.object({
  sessionId: z.string().min(1),
  actionId: z.string().min(1),
  response: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = ActionResponseSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { sessionId, actionId, response: userResponse } = parsed.data;

      // Verify session ownership
      const voiceSession = await sessionManager.getSession(sessionId);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this session', 403);
      }

      // Persist the action response as a message
      const actionMessage = await prisma.shadowMessage.create({
        data: {
          sessionId,
          role: 'user',
          content: `Action response: ${userResponse}`,
          contentType: 'TEXT',
          channel: voiceSession.currentChannel,
          actionsTaken: [{ actionId, response: userResponse, respondedAt: new Date().toISOString() }] as any,
        },
      });

      // Touch session
      await sessionManager.touchSession(sessionId);

      // Return confirmation
      return success({
        id: actionMessage.id,
        content: `Action "${userResponse}" confirmed.`,
        contentType: 'TEXT',
        timestamp: actionMessage.createdAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process action';
      return error('ACTION_FAILED', message, 500);
    }
  });
}
