import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withAuth } from '@/shared/middleware/auth';

const createCollectionSchema = z.object({
  entityId: z.string().min(1),
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
  return withAuth(request, async (req, _session) => {
    try {
      const { searchParams } = req.nextUrl;
      const entityId = searchParams.get('entityId');

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

      // Use KnowledgeEntry with a special source='collection' convention
      // to store collections without schema changes
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
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = createCollectionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, name, description, entryIds } = parsed.data;

      const entry = await prisma.knowledgeEntry.create({
        data: {
          entityId,
          source: 'collection',
          content: JSON.stringify({
            name,
            description: description || '',
            entryIds: entryIds || [],
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
        entryIds: entryIds || [],
        entryCount: (entryIds || []).length,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };

      return success(collection, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create collection', 500);
    }
  });
}
