// ============================================================================
// GET /api/shadow/config/entity — every entity voice profile the user owns
// v3 spec, Addition 5.1.
// ============================================================================
//
// P-16, deliverable 6. `GET /api/shadow/config/entity/[id]` could read one
// profile if you already knew the entity id; there was no way to list them, so
// a settings page offering "switch persona" had nothing to populate a picker
// with, and no way to show which entities have a persona configured at all.
//
// Each row is `entityPersonaService.getEntityProfile`'s answer, which fills in
// the documented defaults for an entity that has no `ShadowEntityProfile` row
// yet. `configured` says which is which, because "tone: professional-friendly"
// with no row behind it and the same value typed by the user are different
// facts and a picker should not present them identically.

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { entityPersonaService } from '@/modules/shadow/proactive/entity-persona';

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      // Ownership is the WHERE clause. There is no id in the request to check,
      // which is the only reason this route is user-scoped rather than
      // entity-scoped: the subject is the set of entities the user owns.
      const entities = await prisma.entity.findMany({
        where: { userId: session.userId },
        select: { id: true },
        orderBy: { name: 'asc' },
      });

      const configured = new Set(
        (
          await prisma.shadowEntityProfile.findMany({
            where: { entityId: { in: entities.map((e) => e.id) } },
            select: { entityId: true },
          })
        ).map((row) => row.entityId)
      );

      const profiles = [];
      for (const entity of entities) {
        const profile = await entityPersonaService.getEntityProfile(entity.id);
        if (profile) {
          profiles.push({ ...profile, configured: configured.has(entity.id) });
        }
      }

      return success(profiles);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to list entity profiles',
        500
      );
    }
  });
}
