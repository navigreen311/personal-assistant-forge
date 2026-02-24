import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
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

      const resolvedEntityId = parsed.data.entityId ?? session.activeEntityId ?? undefined;

      const voiceSession = await sessionManager.startSession({
        userId: session.userId,
        channel: parsed.data.channel,
        entityId: resolvedEntityId,
        currentPage: parsed.data.currentPage,
      });

      // Look up entity name for the frontend
      let entityName: string | undefined;
      if (voiceSession.activeEntityId) {
        const entity = await prisma.entity.findUnique({
          where: { id: voiceSession.activeEntityId },
          select: { name: true },
        });
        entityName = entity?.name ?? undefined;
      }

      return success({
        ...voiceSession,
        entityId: voiceSession.activeEntityId,
        entityName,
        welcomeMessage: entityName
          ? `Hey! Shadow here. I'm ready to help with ${entityName}. What can I do for you?`
          : 'Hey! Shadow here. How can I help you today?',
      }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session';
      return error('SESSION_START_FAILED', message, 500);
    }
  });
}
