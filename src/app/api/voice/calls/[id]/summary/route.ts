import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { analyzeCall } from '@/modules/voiceforge/services/conversational-intel';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

/** Section 4 -- the entity is a property of the row. Duplicated per file, section 3d. */
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
      select: { entityId: true },
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

      // Parse transcript segments if available
      let segments = [];
      if (call.transcript) {
        try {
          segments = JSON.parse(call.transcript);
        } catch {
          segments = [];
        }
      }

      const analysis = await analyzeCall(call.id, segments);
      return success(analysis);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
