// ============================================================================
// P-29 — `POST /api/auth/switch-entity`
//
// Before this package the handler ended:
//
//     return success({ activeEntityId: entityId });   // and nothing else
//
// No row, no cookie, no re-minted token. `token.activeEntityId` is assigned in
// exactly one place (`src/lib/auth/config.ts`, inside `if (user)`, i.e. initial
// sign-in only) and set to the user's OLDEST entity, so every user was pinned
// there for the life of the account while this endpoint reported success. The
// client's `await update()` re-issued the same value it already had.
// `tests/db/platform-surface.test.ts` recorded that as a FINDING it could not
// fix; this is the fix.
//
// Decision 1 (`docs/parallel-build/decision-01-entity-isolation.md`) makes
// `record.entityId === scopedEntityId` the rule. That rule cannot ship until
// "the entity I am acting in" is a real, movable thing. This endpoint is what
// moves it.
//
// WHERE OWNERSHIP IS VERIFIED, AND WHY IT IS HERE
//
// Below, unchanged: `prisma.entity.findFirst({ where: { id, userId } })`. The
// id arrives in the request body -- so it is a caller-supplied value, and it is
// written into a TOKEN, which is a capability. The check therefore happens
// before `remintSessionCookie` is called, against the database, in the same
// request; failure is a 403 and no cookie is set. Nothing else in this file may
// be reordered around it.
//
// The refusal is deliberately identical for "not yours" and "does not exist":
// a distinguishable 404 would turn this endpoint into an oracle for the
// existence of other tenants' entity ids.
//
// AUDIT
//
// `withAuditedAuth` rather than `withAuth`, joining the 30 routes already wired
// to the audit log. A tenant-context change is exactly the event an auditor
// reconstructs a session from, and the wrapper sits outside the auth check so
// the 401s and the cross-tenant 403s produce rows too -- the most valuable
// lines in the file.
//
// One honest limitation, stated rather than hidden: `recordAround` resolves the
// row's `entityId` from the query string or the session token, and this route
// takes its target from the BODY. So the row is filed under the entity the
// caller was acting in WHEN they asked to switch, not the one they switched to.
// That is a defensible column value -- it is the context the action happened in
// -- and the destination is the `entityId` on every row that follows. Filing it
// under the requested id instead would require editing
// `src/modules/security/audit-wiring.ts`, which is frozen, and that file argues
// at length against writing a merely-requested id into that column anyway.
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { remintSessionCookie } from '@/lib/auth/session-token';

const switchEntitySchema = z.object({
  entityId: z.string().min(1, 'Entity ID is required'),
});

export async function POST(req: NextRequest) {
  return withAuditedAuth(
    req,
    { resource: 'auth.switch-entity', sensitivityLevel: 'CONFIDENTIAL' },
    async (_req, session) => {
      try {
        const body = await req.json();
        const parsed = switchEntitySchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid input', 400, {
            fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          });
        }

        const { entityId } = parsed.data;

        // Verify user owns the entity
        const entity = await prisma.entity.findFirst({
          where: { id: entityId, userId: session.userId },
        });

        if (!entity) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }

        const res = success({ activeEntityId: entity.id });

        // The switch IS the cookie. `entity.id` is the row that was just proved
        // to belong to the caller, not the string they sent.
        const reminted = await remintSessionCookie(req, res, { activeEntityId: entity.id });

        if (!reminted) {
          // Returning 200 here would reproduce the exact defect this package
          // exists to remove: a success the session never received.
          return error(
            'SESSION_UPDATE_FAILED',
            'Entity verified, but the session could not be updated. Please sign in again.',
            500
          );
        }

        return res;
      } catch (err) {
        console.error('Entity switch error:', err);
        return error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
      }
    }
  );
}
