import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withEntityScope } from '@/shared/middleware/auth';

const createCollectionSchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  entryIds: z.array(z.string()).optional(),
});

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  entityId: string;
  entryIds: string[];
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      // Collections are stored as KnowledgeEntry rows with source='collection'
      // to avoid a schema change.
      const collectionEntries = await prisma.knowledgeEntry.findMany({
        where: {
          entityId,
          source: 'collection',
        },
        orderBy: { createdAt: 'desc' },
      });

      const collections: KnowledgeCollection[] = collectionEntries.map((entry) => {
        let parsed: { name?: string; description?: string; entryIds?: string[] } = {};
        try {
          parsed = JSON.parse(entry.content) as { name?: string; description?: string; entryIds?: string[] };
        } catch {
          // fallback
        }
        return {
          id: entry.id,
          name: parsed.name || 'Untitled Collection',
          description: parsed.description || '',
          entityId: entry.entityId,
          entryIds: parsed.entryIds || [],
          entryCount: (parsed.entryIds || []).length,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        };
      });

      return success(collections);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to list collections', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createCollectionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { name, description, entryIds } = parsed.data;

      // A collection is a list of entry ids. Ids the caller does not own are
      // dropped rather than stored, so a collection can never become a handle
      // on another tenant's entries.
      const requested = entryIds || [];
      const owned = requested.length
        ? (
            await prisma.knowledgeEntry.findMany({
              where: { id: { in: requested }, entityId },
              select: { id: true },
            })
          ).map((e) => e.id)
        : [];

      const entry = await prisma.knowledgeEntry.create({
        data: {
          entityId,
          source: 'collection',
          content: JSON.stringify({
            name,
            description: description || '',
            entryIds: owned,
          }),
          tags: ['collection'],
          linkedEntities: [],
        },
      });

      const collection: KnowledgeCollection = {
        id: entry.id,
        name,
        description: description || '',
        entityId: entry.entityId,
        entryIds: owned,
        entryCount: owned.length,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };

      return success(collection, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create collection', 500);
    }
  });
}
