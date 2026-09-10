import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { addLearningItem } from '@/modules/knowledge/services/learning-tracker';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import type { StoredLearningData, LearningItem } from '@/modules/knowledge/types';

const addLearningSchema = z.object({
  entityId: z.string().min(1).optional(),
  title: z.string().min(1),
  type: z.enum(['BOOK', 'COURSE', 'ARTICLE', 'PODCAST', 'VIDEO', 'PAPER']),
  status: z.enum(['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED']),
  progress: z.number().min(0).max(100),
  notes: z.array(z.string()),
  keyTakeaways: z.array(z.string()),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  nextReviewDate: z.string().datetime().optional(),
  tags: z.array(z.string()),
  url: z.string().optional(),
});

function toLearningItem(entry: Record<string, unknown>): LearningItem {
  const data = JSON.parse(entry.content as string) as StoredLearningData;
  return {
    id: entry.id as string,
    entityId: entry.entityId as string,
    title: data.title,
    type: data.type,
    status: data.status,
    progress: data.progress,
    notes: data.notes,
    keyTakeaways: data.keyTakeaways,
    startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
    completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
    nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : undefined,
    reviewCount: data.reviewCount,
    tags: (entry.tags as string[]) || [],
    url: data.url,
    createdAt: new Date(entry.createdAt as string),
    updatedAt: new Date(entry.updatedAt as string),
  };
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const status = req.nextUrl.searchParams.get('status');

      const entries = await prisma.knowledgeEntry.findMany({
        where: {
          entityId,
          source: { startsWith: 'learning://' },
        },
        orderBy: { createdAt: 'desc' },
      });

      let items = entries.map((e: unknown) => toLearningItem(e as unknown as Record<string, unknown>));

      if (status) {
        items = items.filter((item: LearningItem) => item.status === status);
      }

      return success(items);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to list learning items', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = addLearningSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const { entityId: _requested, ...draft } = parsed.data;
        const data = {
          ...draft,
          startedAt: draft.startedAt ? new Date(draft.startedAt) : undefined,
          completedAt: draft.completedAt ? new Date(draft.completedAt) : undefined,
          nextReviewDate: draft.nextReviewDate ? new Date(draft.nextReviewDate) : undefined,
        };

        const item = await addLearningItem(data, entityId);
        return success(item, 201);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to add learning item', 500);
      }
    })
  );
}
