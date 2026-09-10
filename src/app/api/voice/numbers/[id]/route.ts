import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { getNumber, releaseNumber } from '@/modules/voiceforge/services/number-manager';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

/** Section 4 -- the entity is a property of the row. Duplicated per file, section 3d. */
async function withNumberScope(
  request: NextRequest,
  numberId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findFirst({
      where: { id: numberId, type: 'MANAGED_NUMBER' },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Number ${numberId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withNumberScope(request, id, async (_req, _session, entityId) => {
    try {
      const number = await getNumber(id, entityId);

      if (!number) {
        return error('NOT_FOUND', `Number ${id} not found`, 404);
      }

      return success(number);
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
    withNumberScope(request, id, async (_req, _session, entityId) => {
      try {
        await releaseNumber(id, entityId);
        return success({ released: true });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return error('NOT_FOUND', err.message, 404);
        }
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
