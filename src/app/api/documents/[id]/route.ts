import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  citations: z.array(z.object({
    id: z.string(),
    sourceType: z.enum(['DOCUMENT', 'MESSAGE', 'KNOWLEDGE', 'WEB']),
    sourceId: z.string(),
    excerpt: z.string(),
  })).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * tenancy-pattern.md sec.4 -- the entity is a property of the row, not the request.
 *
 * `GET /api/documents/<id>` names no entity, so falling through to the
 * session's active entity would answer about a document the caller never asked
 * for. Resolve the owner from the row, then prove it.
 *
 * Duplicated per route file on purpose (sec.8 trap 3d): a Next.js route file may
 * export only HTTP handlers, so this cannot be hoisted into a shared module in
 * this directory.
 */
async function withDocumentScope(
  request: NextRequest,
  documentId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  // Authenticate FIRST, so an anonymous caller never reaches the database.
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findUnique({
      where: { id: documentId },
      select: { entityId: true, deletedAt: true }, // the scope ONLY -- no data crosses this line
    });

    if (!owner || owner.deletedAt) {
      return error('NOT_FOUND', `Document not found: ${documentId}`, 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withDocumentScope(request, id, async (_req, _session, entityId) => {
    try {
      // findFirst with the scope in the WHERE: a foreign row is simply not
      // found, so there is no check-then-act to forget.
      const document = await prisma.document.findFirst({
        where: { id, entityId, deletedAt: null },
        include: {
          entity: { select: { id: true, name: true } },
        },
      });

      if (!document) {
        return error('NOT_FOUND', `Document not found: ${id}`, 404);
      }

      return success(document);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get document', 500);
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withDocumentScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();

        const parsed = updateDocumentSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;
        const updateData: Record<string, unknown> = {};

        if (data.title !== undefined) updateData.title = data.title;
        if (data.content !== undefined) updateData.content = data.content;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.citations !== undefined) updateData.citations = data.citations;

        // updateMany, not update: a unique WHERE cannot carry the entity.
        const result = await prisma.document.updateMany({
          where: { id, entityId, deletedAt: null },
          data: updateData,
        });

        if (result.count === 0) {
          return error('NOT_FOUND', `Document not found: ${id}`, 404);
        }

        const updated = await prisma.document.findFirst({
          where: { id, entityId },
          include: {
            entity: { select: { id: true, name: true } },
          },
        });

        return success(updated);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to update document', 500);
      }
    })
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withRole(request, ['owner', 'admin'], () =>
    withDocumentScope(request, id, async (_req, _session, entityId) => {
      try {
        const result = await prisma.document.updateMany({
          where: { id, entityId, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        if (result.count === 0) {
          return error('NOT_FOUND', `Document not found: ${id}`, 404);
        }

        return success({ deleted: true });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to delete document', 500);
      }
    })
  );
}
