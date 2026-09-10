import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import {
  createEntry,
  getUpcomingReviews,
} from '@/modules/decisions/services/decision-journal';

const CreateJournalSchema = z.object({
  entityId: z.string().min(1).optional(),
  decisionId: z.string().optional(),
  title: z.string().min(1).max(200),
  context: z.string().min(1),
  optionsConsidered: z.array(z.string()).min(1),
  chosenOption: z.string().min(1),
  rationale: z.string().min(1),
  expectedOutcomes: z.array(z.string()).min(1),
  reviewDate: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
      const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
      const upcomingDays = searchParams.get('upcomingDays');

      if (upcomingDays) {
        const days = Number(upcomingDays);
        if (isNaN(days) || days < 0) {
          return error('VALIDATION_ERROR', 'upcomingDays must be a positive number', 400);
        }
        const entries = await getUpcomingReviews(entityId, days);
        return success(entries);
      }

      const where = { entityId, type: 'REPORT' as const };
      const [docs, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.document.count({ where }),
      ]);

      const entries = docs.map((doc: { id: string; title: string; content: string | null; createdAt: Date; updatedAt: Date }) => {
        const data = doc.content ? JSON.parse(doc.content) : {};
        return {
          id: doc.id,
          title: doc.title,
          entityId: data.entityId ?? '',
          status: data.status ?? 'PENDING_REVIEW',
          reviewDate: data.reviewDate,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      });

      return paginated(entries, total, page, pageSize);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to list journal entries', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = CreateJournalSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      // entityId LAST, deliberately: it overwrites the caller's own value.
      const { entityId: _requested, ...draft } = parsed.data;
      const entry = await createEntry({
        ...draft,
        reviewDate: new Date(draft.reviewDate),
        status: 'PENDING_REVIEW',
        entityId,
      });

      return success(entry, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create journal entry', 500);
    }
  });
}
