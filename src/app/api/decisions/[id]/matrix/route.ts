import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';
import { createMatrix } from '@/modules/decisions/services/decision-matrix';

const CriterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
  description: z.string().optional(),
});

const ScoreSchema = z.object({
  criterionId: z.string().min(1),
  optionId: z.string().min(1),
  score: z.number().min(1).max(10),
  rationale: z.string().min(1),
});

const MatrixRequestSchema = z.object({
  criteria: z.array(CriterionSchema).min(1),
  scores: z.array(ScoreSchema).min(1),
});

/**
 * tenancy-pattern.md sec.4. createMatrix is pure arithmetic, but the route is
 * addressed by a decision id and echoes it back, so it still confirms or
 * denies the existence of another tenant's decision unless it is scoped.
 *
 * Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withDecisionScope(
  request: NextRequest,
  decisionId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.decision.findUnique({
      where: { id: decisionId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Decision not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: decisionId } = await params;

  return withDecisionScope(request, decisionId, async (req) => {
    try {
      const body = await req.json();
      const parsed = MatrixRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = createMatrix(decisionId, parsed.data.criteria, parsed.data.scores);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run decision matrix';
      if (message.includes('Weights sum to') || message.includes('negative weight')) {
        return error('VALIDATION_ERROR', message, 400);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
