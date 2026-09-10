import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';
import { reviewEntry } from '@/modules/decisions/services/decision-journal';

const ReviewSchema = z.object({
  actualOutcomes: z.array(z.string()).min(1),
  status: z.enum(['REVIEWED_CORRECT', 'REVIEWED_INCORRECT', 'REVIEWED_MIXED']),
  lessonsLearned: z.string().min(1),
});

/**
 * tenancy-pattern.md sec.4. Journal entries are Document rows of type 'REPORT'.
 * Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withJournalScope(
  request: NextRequest,
  entryId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findUnique({
      where: { id: entryId },
      select: { entityId: true, type: true, deletedAt: true },
    });

    if (!owner || owner.type !== 'REPORT' || owner.deletedAt) {
      return error('NOT_FOUND', `Journal entry ${entryId} not found`, 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withJournalScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = ReviewSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const entry = await reviewEntry(
          id,
          entityId,
          parsed.data.actualOutcomes,
          parsed.data.status,
          parsed.data.lessonsLearned
        );

        return success(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to review journal entry';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
