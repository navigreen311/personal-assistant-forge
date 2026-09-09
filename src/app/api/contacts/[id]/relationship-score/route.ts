import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { calculateRelationshipScore } from '@/modules/communication/services/relationship-intelligence';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * This route had NO AUTHENTICATION AT ALL: withAuth was never imported, so any
 * caller could score any contact in the database by id -- and the score is
 * computed from that tenant's messages and calls.
 */
async function withContactScope(
  request: NextRequest,
  contactId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Contact not found: ${contactId}`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (_req, _session, entityId) => {
    try {
      const score = await calculateRelationshipScore(id, entityId);
      return success({ contactId: id, score });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to calculate relationship score';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
