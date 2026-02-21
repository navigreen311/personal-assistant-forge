import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

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

export async function GET(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await context.params;

      const document = await prisma.document.findUnique({
        where: { id },
        include: {
          entity: { select: { id: true, name: true } },
        },
      });

      if (!document || document.deletedAt) {
        return error('NOT_FOUND', `Document not found: ${id}`, 404);
      }

      // Verify the document's entity belongs to the user
      const entity = await prisma.entity.findUnique({
        where: { id: document.entityId },
      });

      if (!entity || entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this document', 403);
      }

      return success(document);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get document', 500);
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await context.params;
      const body = await req.json();

      const parsed = updateDocumentSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const existing = await prisma.document.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        return error('NOT_FOUND', `Document not found: ${id}`, 404);
      }

      // Verify the document's entity belongs to the user
      const entity = await prisma.entity.findUnique({
        where: { id: existing.entityId },
      });

      if (!entity || entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this document', 403);
      }

      const data = parsed.data;
      const updateData: Record<string, unknown> = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.content !== undefined) updateData.content = data.content;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.citations !== undefined) updateData.citations = data.citations;

      const updated = await prisma.document.update({
        where: { id },
        data: updateData,
        include: {
          entity: { select: { id: true, name: true } },
        },
      });

      return success(updated);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to update document', 500);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await context.params;

      const existing = await prisma.document.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        return error('NOT_FOUND', `Document not found: ${id}`, 404);
      }

      // Verify the document's entity belongs to the user
      const entity = await prisma.entity.findUnique({
        where: { id: existing.entityId },
      });

      if (!entity || entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this document', 403);
      }

      // Soft-delete: set deletedAt timestamp
      await prisma.document.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to delete document', 500);
    }
  });
}
