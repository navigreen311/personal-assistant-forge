import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { knowledgeEntryToCaptured, parseStoredData } from '@/modules/knowledge/services/capture-service';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import type { KnowledgeEntry } from '@/shared/types';
import type { StoredKnowledgeData } from '@/modules/knowledge/types';

const updateSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * tenancy-pattern.md sec.4 -- the entity is a property of the row, not the request.
 *
 * Duplicated per route file on purpose (sec.8 trap 3d): a Next.js route file may
 * export only HTTP handlers.
 */
async function withEntryScope(
  request: NextRequest,
  entryId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  // Authenticate FIRST, so an anonymous caller never reaches the database.
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.knowledgeEntry.findUnique({
      where: { id: entryId },
      select: { entityId: true }, // the scope ONLY -- no data crosses this line
    });

    if (!owner) {
      return error('NOT_FOUND', 'Knowledge entry not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withEntryScope(request, id, async (_req, _session, entityId) => {
    try {
      const entry = await prisma.knowledgeEntry.findFirst({ where: { id, entityId } });

      if (!entry) {
        return error('NOT_FOUND', 'Knowledge entry not found', 404);
      }

      const captured = knowledgeEntryToCaptured(entry as unknown as KnowledgeEntry);

      // Every hop of the graph is scoped. `linkedEntities` is a bare array of
      // ids with no integrity constraint, so without `entityId` here a single
      // foreign id planted in that column would have returned another tenant's
      // entry in full.
      const ke = entry as unknown as KnowledgeEntry;
      const linkedEntries = ke.linkedEntities.length > 0
        ? await prisma.knowledgeEntry.findMany({
            where: { id: { in: ke.linkedEntities }, entityId },
          })
        : [];

      return success({
        ...captured,
        linked: linkedEntries.map((e: unknown) => knowledgeEntryToCaptured(e as unknown as KnowledgeEntry)),
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get knowledge entry', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withEntryScope(request, id, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const existing = await prisma.knowledgeEntry.findFirst({ where: { id, entityId } });
      if (!existing) {
        return error('NOT_FOUND', 'Knowledge entry not found', 404);
      }

      const existingKe = existing as unknown as KnowledgeEntry;
      const stored = parseStoredData(existingKe.content);

      const updatedStored: StoredKnowledgeData = {
        ...stored,
        body: parsed.data.content || stored.body,
        title: parsed.data.title || stored.title,
        metadata: parsed.data.metadata || stored.metadata,
      };

      const updateData: Record<string, unknown> = {
        content: JSON.stringify(updatedStored),
      };
      if (parsed.data.tags) updateData.tags = parsed.data.tags;
      if (parsed.data.source) updateData.source = parsed.data.source;

      // updateMany, not update: a unique WHERE cannot carry the entity.
      const result = await prisma.knowledgeEntry.updateMany({
        where: { id, entityId },
        data: updateData,
      });

      if (result.count === 0) {
        return error('NOT_FOUND', 'Knowledge entry not found', 404);
      }

      const updated = await prisma.knowledgeEntry.findFirst({ where: { id, entityId } });
      return success(knowledgeEntryToCaptured(updated as unknown as KnowledgeEntry));
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to update knowledge entry', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withEntryScope(request, id, async (_req, _session, entityId) => {
    try {
      // deleteMany, not delete: the scope goes in the WHERE clause.
      const result = await prisma.knowledgeEntry.deleteMany({ where: { id, entityId } });

      if (result.count === 0) {
        return error('NOT_FOUND', 'Knowledge entry not found', 404);
      }

      return success({ deleted: true });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to delete knowledge entry', 500);
    }
  });
}
