import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { addCommitment } from '@/modules/communication/services/commitment-tracker';
import type { Commitment } from '@/shared/types';

const addCommitmentSchema = z.object({
  description: z.string().min(1, 'description is required'),
  direction: z.enum(['TO', 'FROM']),
  status: z.enum(['OPEN', 'FULFILLED', 'BROKEN']).default('OPEN'),
  dueDate: z.string().datetime().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * This route had NO AUTHENTICATION AT ALL: withAuth was never imported, so any
 * caller could read and append commitments on any contact in the database.
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
      const contact = await prisma.contact.findFirst({ where: { id, entityId } });
      if (!contact) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      const commitments = (contact.commitments as unknown as Commitment[]) ?? [];
      return success(commitments);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get commitments', 500);
    }
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = addCommitmentSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const commitment = await addCommitment(
        id,
        {
          description: data.description,
          direction: data.direction,
          status: data.status,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
        entityId
      );

      return success(commitment, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add commitment';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
