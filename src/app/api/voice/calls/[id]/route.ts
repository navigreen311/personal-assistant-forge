import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

/**
 * Resolve the entity from the call ROW, then prove the caller owns it.
 *
 * withEntityScope resolves from query / body / session, none of which describe
 * `GET /api/voice/calls/<id>`. Falling through to the session's active entity
 * would answer about a call the caller never asked for. Authenticate first, so
 * an anonymous caller never reaches the database. Tenancy pattern, section 4 --
 * and section 3d: this block is duplicated per route file on purpose, because a
 * Next.js route file may only export HTTP handlers.
 */
async function withCallScope(
  request: NextRequest,
  callId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.call.findUnique({
      where: { id: callId },
      select: { entityId: true }, // the id ONLY -- no call data crosses this line
    });
    if (!owner) {
      return error('NOT_FOUND', `Call ${callId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withCallScope(request, id, async (_req, _session, entityId) => {
    try {
      const call = await prisma.call.findFirst({ where: { id, entityId } });

      if (!call) {
        return error('NOT_FOUND', `Call ${id} not found`, 404);
      }

      return success(call);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withCallScope(request, id, async (_req, _session, entityId) => {
      try {
        // deleteMany, not delete: a unique WHERE cannot carry the entity, so
        // `delete({ where: { id } })` would let anyone holding an id destroy any
        // tenant's call record. count === 0 is not-found. Section 3.
        const res = await prisma.call.deleteMany({ where: { id, entityId } });

        if (res.count === 0) {
          return error('NOT_FOUND', `Call ${id} not found`, 404);
        }

        return success({ deleted: true });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
