import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { getScript, validateScript } from '@/modules/voiceforge/services/script-engine';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

/** Section 4 -- the entity is a property of the row. Duplicated per file, section 3d. */
async function withScriptScope(
  request: NextRequest,
  scriptId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findFirst({
      where: { id: scriptId, type: 'CALL_SCRIPT' },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Script ${scriptId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withScriptScope(request, id, async (_req, _session, entityId) => {
    try {
      const script = await getScript(id, entityId);

      if (!script) {
        return error('NOT_FOUND', `Script ${id} not found`, 404);
      }

      const validation = validateScript(script);
      return success(validation);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
