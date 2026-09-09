import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';

const DecideSchema = z.object({
  chosenOptionId: z.string().min(1),
  rationale: z.string().min(1),
  reviewDate: z.string().datetime().optional(),
});

/**
 * tenancy-pattern.md sec.4. This route already compared entity.userId to the
 * session, which was correct; it is rewritten here so the scope sits in the
 * WHERE clause of the write too, rather than in a check the next edit could
 * reorder past.
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
  const { id } = await params;

  return withDecisionScope(request, id, async (req, session, entityId) => {
    try {
      const decision = await prisma.decision.findFirst({ where: { id, entityId } });

      if (!decision) {
        return error('NOT_FOUND', 'Decision not found', 404);
      }

      if (decision.status === 'decided') {
        return error(
          'VALIDATION_ERROR',
          'This decision has already been decided',
          400
        );
      }

      const body = await req.json();
      const parsed = DecideSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const { chosenOptionId, rationale, reviewDate } = parsed.data;

      const options = (decision.options as Array<{ id: string }>) ?? [];
      const optionExists = options.some((opt) => opt.id === chosenOptionId);

      if (!optionExists) {
        return error(
          'VALIDATION_ERROR',
          `Option "${chosenOptionId}" not found in this decision's options`,
          400
        );
      }

      // updateMany with the scope in the WHERE, and status re-asserted so a
      // concurrent decide cannot land twice.
      const result = await prisma.decision.updateMany({
        where: { id, entityId, status: { not: 'decided' } },
        data: {
          status: 'decided',
          outcome: chosenOptionId,
          rationale,
          decidedAt: new Date(),
          // The authenticated caller, named on the record.
          decidedBy: session.userId,
        },
      });

      if (result.count === 0) {
        return error('VALIDATION_ERROR', 'This decision has already been decided', 400);
      }

      const updated = await prisma.decision.findFirst({ where: { id, entityId } });

      return success({
        id: updated!.id,
        status: updated!.status,
        outcome: updated!.outcome,
        rationale: updated!.rationale,
        decidedAt: updated!.decidedAt,
        decidedBy: updated!.decidedBy,
        reviewDate: reviewDate ?? null,
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to record decision', 500);
    }
  });
}
