import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const QuerySchema = z.object({
  entityId: z.string().min(1).optional(),
  type: z
    .enum([
      'strategic',
      'operational',
      'financial',
      'hiring',
      'vendor',
      'investment',
    ])
    .optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z
    .enum(['open', 'in_review', 'decided', 'deferred', 'cancelled'])
    .optional(),
  search: z.string().optional(),
  sort: z.enum(['date', 'urgency', 'deadline']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

interface DecisionOption {
  id: string;
  label?: string;
  description?: string;
  score?: number;
  pros?: string[];
  cons?: string[];
}

interface MatrixData {
  criteria?: Array<{ id: string; weight: number }>;
  scores?: Record<string, Record<string, number>>;
}

const URGENCY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function computeUrgencyFromDeadline(deadline: Date | null): string {
  if (!deadline) return 'low';
  const now = new Date();
  const hoursUntil =
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil <= 24) return 'critical';
  if (hoursUntil <= 72) return 'high';
  if (hoursUntil <= 168) return 'medium'; // 7 days
  return 'low';
}

function getHighestScoredOption(
  options: DecisionOption[]
): string | null {
  if (!Array.isArray(options) || options.length === 0) return null;
  let best: DecisionOption | null = null;
  for (const opt of options) {
    if (
      typeof opt.score === 'number' &&
      (!best || (best.score ?? -Infinity) < opt.score)
    ) {
      best = opt;
    }
  }
  return best?.label ?? best?.id ?? null;
}

function computeConfidenceFromMatrix(matrix: MatrixData | null): number | null {
  if (!matrix?.criteria || !matrix?.scores) return null;

  const criteria = matrix.criteria;
  const scores = matrix.scores;

  if (criteria.length === 0) return null;

  // Confidence is based on how decisive the matrix scores are:
  // high spread between best and worst option = high confidence
  const optionTotals: number[] = [];

  const optionIds = Object.keys(scores);
  for (const optId of optionIds) {
    const optScores = scores[optId];
    if (!optScores) continue;

    let weightedTotal = 0;
    for (const criterion of criteria) {
      const score = optScores[criterion.id] ?? 0;
      weightedTotal += score * (criterion.weight ?? 1);
    }
    optionTotals.push(weightedTotal);
  }

  if (optionTotals.length < 2) return null;

  const maxScore = Math.max(...optionTotals);
  const minScore = Math.min(...optionTotals);
  const totalWeight = criteria.reduce(
    (sum, c) => sum + (c.weight ?? 1),
    0
  );
  const maxPossibleSpread = totalWeight * 10; // assuming 10-point scale

  if (maxPossibleSpread === 0) return null;

  const spread = maxScore - minScore;
  const confidence = Math.round((spread / maxPossibleSpread) * 100) / 100;

  return Math.min(1, Math.max(0, confidence));
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;

      // Parse query params into an object
      const rawParams: Record<string, string> = {};
      for (const [key, value] of searchParams.entries()) {
        rawParams[key] = value;
      }

      const parsed = QuerySchema.safeParse(rawParams);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      const {
        entityId,
        type,
        urgency,
        status,
        search,
        sort = 'date',
        sortOrder = 'desc',
        page = 1,
        pageSize = 20,
      } = parsed.data;

      // Verify entity ownership
      const entityWhere = entityId
        ? { id: entityId, userId: session.userId }
        : { userId: session.userId };

      const userEntities = await prisma.entity.findMany({
        where: entityWhere,
        select: { id: true, name: true },
      });

      if (entityId && userEntities.length === 0) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      const entityIds = userEntities.map((e) => e.id);
      const entityNameMap = new Map(
        userEntities.map((e) => [e.id, e.name])
      );

      // Build Prisma where clause
      const where: Record<string, unknown> = {
        entityId: { in: entityIds },
      };

      if (type) where.type = type;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { rationale: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Determine sort order
      let orderBy: Record<string, string>;
      switch (sort) {
        case 'deadline':
          orderBy = { deadline: sortOrder };
          break;
        case 'urgency':
          // Sort by deadline proximity (closest deadline first for asc)
          orderBy = { deadline: sortOrder === 'asc' ? 'asc' : 'desc' };
          break;
        case 'date':
        default:
          orderBy = { createdAt: sortOrder };
          break;
      }

      const [decisions, total] = await Promise.all([
        prisma.decision.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.decision.count({ where }),
      ]);

      // Enhance each decision with computed fields
      type DecisionRow = (typeof decisions)[number];

      const enhanced = decisions.map((d: DecisionRow) => {
        const options = (d.options as unknown as DecisionOption[]) ?? [];
        const stakeholders = (d.stakeholders as unknown[]) ?? [];
        const matrix = d.matrix as MatrixData | null;

        return {
          id: d.id,
          entityId: d.entityId,
          entityName: entityNameMap.get(d.entityId) ?? null,
          title: d.title,
          type: d.type,
          status: d.status,
          outcome: d.outcome,
          rationale: d.rationale,
          deadline: d.deadline,
          decidedAt: d.decidedAt,
          decidedBy: d.decidedBy,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          // Computed fields
          stakeholderCount: Array.isArray(stakeholders)
            ? stakeholders.length
            : 0,
          optionCount: Array.isArray(options) ? options.length : 0,
          recommendation: getHighestScoredOption(options),
          confidence: computeConfidenceFromMatrix(matrix),
        };
      });

      // Post-filter by urgency if specified (computed from deadline)
      let filteredResults = enhanced;
      if (urgency) {
        filteredResults = enhanced.filter(
          (d) => computeUrgencyFromDeadline(d.deadline) === urgency
        );
      }

      // If sorting by urgency, apply urgency-based sort
      if (sort === 'urgency') {
        filteredResults.sort((a, b) => {
          const urgA =
            URGENCY_ORDER[computeUrgencyFromDeadline(a.deadline)] ?? 4;
          const urgB =
            URGENCY_ORDER[computeUrgencyFromDeadline(b.deadline)] ?? 4;
          return sortOrder === 'asc' ? urgA - urgB : urgB - urgA;
        });
      }

      const effectiveTotal = urgency ? filteredResults.length : total;

      return paginated(filteredResults, effectiveTotal, page, pageSize);
    } catch (_err) {
      return error(
        'INTERNAL_ERROR',
        'Failed to fetch enhanced decisions',
        500
      );
    }
  });
}
