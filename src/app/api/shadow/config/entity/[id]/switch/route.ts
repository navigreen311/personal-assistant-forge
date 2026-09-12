// ============================================================================
// POST /api/shadow/config/entity/[id]/switch — switch a session's persona
// v3 spec, Addition 5.2.
// ============================================================================
//
// P-16, deliverable 6. `entityPersonaService.switchEntity` had no caller. It is
// what moves `ShadowVoiceSession.activeEntityId`, which is the column
// `context-engine.buildContext` reads to decide which entity every Shadow tool
// is scoped to and which compliance profile goes into the system prompt.
//
// The switch is durable and the response reports what actually changed:
// `personaChanged` is false when the session was already on that entity, and a
// switch that could not be performed is a 403 or a 404 rather than a cheerful
// announcement. See the header of entity-persona.ts for what it used to do
// instead.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import {
  entityPersonaService,
  EntitySwitchError,
} from '@/modules/shadow/proactive/entity-persona';

const SwitchSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error('VALIDATION_ERROR', 'sessionId is required', 400);
    }

    const parsed = SwitchSchema.safeParse(body);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    try {
      const result = await entityPersonaService.switchEntity({
        sessionId: parsed.data.sessionId,
        userId: session.userId,
        targetEntityId: id,
      });

      const profile = await entityPersonaService.getEntityProfile(result.entityId);

      return success({ ...result, profile });
    } catch (err) {
      if (err instanceof EntitySwitchError) {
        // A foreign entity, a foreign session and a nonexistent one are all
        // refusals rather than 500s, and the foreign cases are deliberately not
        // distinguished from the missing ones in the message.
        //
        // P-44. `SESSION_FORBIDDEN` used to sit beside `ENTITY_FORBIDDEN` in the
        // 403 arm. Ivan's ruling — *"404 on all three paths"* — is about
        // deletion, but this was the other half of the same finding P-41 raised:
        // a 403 here told the caller that somebody else's session id is a real
        // cuid. `switchEntity` no longer has a code for it, because it no longer
        // has a state for it; the session is resolved with the owner in the
        // filter, so a foreign session arrives here as `SESSION_NOT_FOUND` and
        // leaves as a 404, indistinguishably from an id that never existed.
        //
        // `ENTITY_FORBIDDEN` is NOT folded in, and the asymmetry is deliberate
        // rather than overlooked. An entity id is not a secret the way a session
        // id is — `GET /api/entities` hands the caller their own and
        // `verifyEntityForUser` is the platform-wide gate for everybody else's —
        // and P-30's 49 route helpers all answer 403 on a foreign entity, so
        // changing one of fifty here would create an inconsistency rather than
        // remove one. Recorded in the P-44 report as a finding for whoever takes
        // entity-scope refusals as a package.
        switch (err.code) {
          case 'ENTITY_FORBIDDEN':
            return error('FORBIDDEN', 'Access denied', 403);
          case 'ENTITY_NOT_FOUND':
          case 'SESSION_NOT_FOUND':
          case 'TARGET_UNRESOLVED':
            return error('NOT_FOUND', err.message, 404);
        }
      }
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to switch entity',
        500
      );
    }
  });
}
