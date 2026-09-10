import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';
import { getDecisionBrief } from '@/modules/decisions/services/decision-framework';

const UpdateDecisionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  deadline: z.string().datetime().optional(),
  stakeholders: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

/**
 * tenancy-pattern.md sec.4 -- the entity is a property of the row, not the request.
 * Decision briefs are stored as Document rows of type 'BRIEF'.
 *
 * Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withBriefScope(
  request: NextRequest,
  briefId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  // Authenticate FIRST, so an anonymous caller never reaches the database.
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findUnique({
      where: { id: briefId },
      select: { entityId: true, type: true, deletedAt: true },
    });

    if (!owner || owner.type !== 'BRIEF' || owner.deletedAt) {
      return error('NOT_FOUND', 'Decision brief not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withBriefScope(request, id, async (_req, _session, entityId) => {
    try {
      const brief = await getDecisionBrief(id, entityId);

      if (!brief) {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      return success(brief);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get decision brief', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withBriefScope(request, id, async (req, _session, entityId) => {
    try {
      const doc = await prisma.document.findFirst({ where: { id, entityId, type: 'BRIEF' } });

      if (!doc) {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      const body = await req.json();
      const parsed = UpdateDecisionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const updates = parsed.data;
      const existingContent = doc.content ? JSON.parse(doc.content) : {};

      const updatedContent = {
        ...existingContent,
        request: {
          ...existingContent.request,
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.context !== undefined && { context: updates.context }),
          ...(updates.deadline !== undefined && { deadline: updates.deadline }),
          ...(updates.stakeholders !== undefined && { stakeholders: updates.stakeholders }),
          ...(updates.constraints !== undefined && { constraints: updates.constraints }),
          ...(updates.blastRadius !== undefined && { blastRadius: updates.blastRadius }),
        },
      };

      // updateMany, not update: a unique WHERE cannot carry the entity.
      const result = await prisma.document.updateMany({
        where: { id, entityId, type: 'BRIEF' },
        data: {
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.status !== undefined && { status: updates.status }),
          content: JSON.stringify(updatedContent),
        },
      });

      if (result.count === 0) {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      const updated = await prisma.document.findFirst({ where: { id, entityId } });

      return success({
        id: updated!.id,
        title: updated!.title,
        status: updated!.status,
        updatedAt: updated!.updatedAt,
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to update decision brief', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withBriefScope(request, id, async (_req, _session, entityId) => {
    try {
      const result = await prisma.document.updateMany({
        where: { id, entityId, type: 'BRIEF' },
        data: { status: 'ARCHIVED' },
      });

      if (result.count === 0) {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      return success({ id, archived: true });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to archive decision brief', 500);
    }
  });
}
