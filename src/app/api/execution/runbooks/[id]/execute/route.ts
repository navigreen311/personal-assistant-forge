// ============================================================================
// POST /api/execution/runbooks/:id/execute - Execute a runbook
// ============================================================================
//
// P-09 (T-001): this handler discarded the session and required the body to
// name `triggeredBy`, then ran a multi-step automation against whatever entity
// the runbook belonged to. Any authenticated user who knew a runbook id could
// fire another tenant's automation, attributed to a name they chose.
//
// The entity is now resolved from the runbook row and verified, and
// `triggeredBy` is the authenticated caller.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { executeRunbook } from '@/modules/execution/services/runbook-service';

async function withRunbookScope(
  request: NextRequest,
  runbookId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.runbook.findUnique({
      where: { id: runbookId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Runbook ${runbookId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

// --- Handler ---

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withRunbookScope(request, id, async (_req, session, entityId) => {
      try {
        const execution = await executeRunbook(id, session.userId, entityId);
        return success(execution, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('EXECUTION_ERROR', message, 500);
      }
    })
  );
}
