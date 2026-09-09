import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { capture } from '@/modules/knowledge/services/capture-service';
import { knowledgeEntryToCaptured } from '@/modules/knowledge/services/capture-service';
import { withEntityScope } from '@/shared/middleware/auth';
import type { KnowledgeEntry } from '@/shared/types';

const captureSchema = z.object({
  // Optional: omitted means the session's active entity. A supplied value is
  // still verified before it is used, and then discarded in favour of the
  // scope -- the client never names its own tenant.
  entityId: z.string().min(1).optional(),
  type: z.enum(['NOTE', 'BOOKMARK', 'VOICE_MEMO', 'CODE_SNIPPET', 'QUOTE', 'ARTICLE', 'IMAGE_NOTE']),
  content: z.string().min(1),
  title: z.string().optional(),
  source: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const type = searchParams.get('type');
      const tags = searchParams.get('tags');
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

      const where: Record<string, unknown> = {};
      if (type) {
        where.content = { contains: `"type":"${type}"` };
      }
      if (tags) {
        where.tags = { hasSome: tags.split(',') };
      }
      // Scope applied LAST and unconditionally: no filter above can widen it.
      where.entityId = entityId;

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
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to list knowledge entries', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = captureSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId: _requested, ...draft } = parsed.data;
      const entry = await capture(draft, entityId);
      return success(entry, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to capture knowledge entry', 500);
    }
  });
}
