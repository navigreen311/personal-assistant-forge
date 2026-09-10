import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { getSOP, updateSOP } from '@/modules/knowledge/services/sop-service';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const sopStepSchema = z.object({
  order: z.number(),
  instruction: z.string().min(1),
  notes: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  isOptional: z.boolean(),
});

const updateSOPSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(sopStepSchema).optional(),
  triggerConditions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

/**
 * tenancy-pattern.md sec.4. SOPs are stored as Document rows of type 'SOP'.
 * Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withSOPScope(
  request: NextRequest,
  sopId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findUnique({
      where: { id: sopId },
      select: { entityId: true, type: true, deletedAt: true },
    });

    if (!owner || owner.type !== 'SOP' || owner.deletedAt) {
      return error('NOT_FOUND', 'SOP not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withSOPScope(request, id, async (_req, _session, entityId) => {
    try {
      const sop = await getSOP(id, entityId);

      if (!sop) {
        return error('NOT_FOUND', 'SOP not found', 404);
      }

      return success(sop);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get SOP', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withSOPScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = updateSOPSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const sop = await updateSOP(id, entityId, parsed.data);
        return success(sop);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update SOP';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
