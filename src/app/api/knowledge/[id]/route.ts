import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { knowledgeEntryToCaptured, parseStoredData } from '@/modules/knowledge/services/capture-service';
import { withAuth } from '@/shared/middleware/auth';
import type { KnowledgeEntry } from '@/shared/types';
import type { StoredKnowledgeData } from '@/modules/knowledge/types';

const updateSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const entry = await prisma.knowledgeEntry.findUnique({ where: { id } });

      if (!entry) {
        return error('NOT_FOUND', 'Knowledge entry not found', 404);
      }

      const captured = knowledgeEntryToCaptured(entry as unknown as KnowledgeEntry);

      // Fetch linked entries
      const ke = entry as unknown as KnowledgeEntry;
      const linkedEntries = ke.linkedEntities.length > 0
        ? await prisma.knowledgeEntry.findMany({
            where: { id: { in: ke.linkedEntities } },
          })
        : [];

      return success({
        ...captured,
        linked: linkedEntries.map((e: unknown) => knowledgeEntryToCaptured(e as unknown as KnowledgeEntry)),
      });
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to get knowledge entry', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
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

      const updated = await prisma.knowledgeEntry.update({
        where: { id },
        data: updateData,
      });

      return success(knowledgeEntryToCaptured(updated as unknown as KnowledgeEntry));
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to update knowledge entry', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });

      if (!existing) {
        return error('NOT_FOUND', 'Knowledge entry not found', 404);
      }

      await prisma.knowledgeEntry.delete({ where: { id } });
      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to delete knowledge entry', 500);
    }
  });
}
