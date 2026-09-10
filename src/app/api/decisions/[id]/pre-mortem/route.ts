import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';
import { runPreMortem } from '@/modules/decisions/services/pre-mortem';

const PreMortemRequestSchema = z.object({
  chosenOptionId: z.string().min(1),
  timeHorizon: z.enum(['30_DAYS', '90_DAYS', '1_YEAR', '3_YEARS']),
});

/**
 * tenancy-pattern.md sec.4. Duplicated per route file on purpose (sec.8 trap 3d).
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

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withDecisionScope(request, decisionId, async (req) => {
      try {
        const body = await req.json();
        const parsed = PreMortemRequestSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const result = await runPreMortem({
          decisionId,
          chosenOptionId: parsed.data.chosenOptionId,
          timeHorizon: parsed.data.timeHorizon,
        });

        return success(result);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to run pre-mortem analysis', 500);
      }
    })
  );
}
