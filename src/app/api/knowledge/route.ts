import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { capture } from '@/modules/knowledge/services/capture-service';
import { knowledgeEntryToCaptured } from '@/modules/knowledge/services/capture-service';
import { withAuth } from '@/shared/middleware/auth';
import type { KnowledgeEntry } from '@/shared/types';

const captureSchema = z.object({
  entityId: z.string().min(1),
  type: z.enum(['NOTE', 'BOOKMARK', 'VOICE_MEMO', 'CODE_SNIPPET', 'QUOTE', 'ARTICLE', 'IMAGE_NOTE']),
  content: z.string().min(1),
  title: z.string().optional(),
  source: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const entityId = searchParams.get('entityId');
      const type = searchParams.get('type');
      const tags = searchParams.get('tags');
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

      const where: Record<string, unknown> = { entityId };
      if (type) {
        where.content = { contains: `"type":"${type}"` };
      }
      if (tags) {
        where.tags = { hasSome: tags.split(',') };
      }

      const [entries, total] = await Promise.all([
        prisma.knowledgeEntry.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.knowledgeEntry.count({ where }),
      ]);

      const captured = entries.map((e: unknown) => knowledgeEntryToCaptured(e as unknown as KnowledgeEntry));
      return paginated(captured, total, page, pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to list knowledge entries', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = captureSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const entry = await capture(parsed.data);
      return success(entry, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to capture knowledge entry', 500);
    }
  });
}
