import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';

import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

const START_ROLES: UserRole[] = ['owner', 'admin', 'member'];

const StartSessionSchema = z.object({
  channel: z.enum(['web', 'phone', 'mobile']),
  // Still accepted and still validated; no longer load-bearing. See below.
  entityId: z.string().min(1).optional(),
  currentPage: z.string().optional(),
});

/**
 * POST /api/shadow/session/start
 *
 * P-34. THIS ROUTE CHOSE THE TENANT SHADOW WOULD ACT AS, FROM THE REQUEST BODY.
 *
 * It read `entityId` off the body, checked nothing, and wrote it to
 * `ShadowVoiceSession.activeEntityId`. `POST /api/shadow/chat` then passes that
 * column to `buildContext`, which fetched the entity with `findUnique` and no
 * ownership check either -- so the entity name, type and COMPLIANCE PROFILE of
 * any tenant went into Shadow's system prompt, and every entity-scoped tool
 * read and wrote that tenant's rows.
 *
 * It is the provenance behind the eleven unscoped tool-router sites: scoping the
 * tools to `context.activeEntity` while this route let a caller choose that
 * entity would have been theatre. Both ends are closed --
 * `withEntityScope` here, `verifyEntityForUser` in `buildContext`, and a third
 * time per tool call in `resolveToolScope` -- because this column is persisted
 * and is read by four other modules that were never going to re-check it.
 *
 * `withEntityScope` resolves the body's `entityId` itself, in the same
 * precedence order this route used, and then applies Decision 1 to it.
 */
export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    if (!START_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const body = await req.json();
      const parsed = StartSessionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const voiceSession = await sessionManager.forUser(session.userId).startSession({
        channel: parsed.data.channel,
        entityId,
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
