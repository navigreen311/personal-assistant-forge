import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { updateProgress } from '@/modules/knowledge/services/learning-tracker';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const updateProgressSchema = z.object({
  progress: z.number().min(0).max(100),
});

/**
 * tenancy-pattern.md sec.4. Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withEntryScope(
  request: NextRequest,
  entryId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.knowledgeEntry.findUnique({
      where: { id: entryId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Learning item not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withEntryScope(request, id, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = updateProgressSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const item = await updateProgress(id, entityId, parsed.data.progress);
      return success(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update learning progress';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
