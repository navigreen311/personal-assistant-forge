import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import {
  createEntry,
  getUpcomingReviews,
} from '@/modules/decisions/services/decision-journal';

const CreateJournalSchema = z.object({
  entityId: z.string().min(1),
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
  try {
    const { searchParams } = request.nextUrl;
    const entityId = searchParams.get('entityId');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
    const upcomingDays = searchParams.get('upcomingDays');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId query parameter is required', 400);
    }

    if (upcomingDays) {
      const days = Number(upcomingDays);
      if (isNaN(days) || days < 0) {
        return error('VALIDATION_ERROR', 'upcomingDays must be a positive number', 400);
      }
      const entries = await getUpcomingReviews(entityId, days);
      return success(entries);
    }

    // List all journal entries for entity with pagination
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
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to list journal entries', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateJournalSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const entry = await createEntry({
      ...parsed.data,
      reviewDate: new Date(parsed.data.reviewDate),
      status: 'PENDING_REVIEW',
    });

    return success(entry, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to create journal entry', 500);
  }
}
