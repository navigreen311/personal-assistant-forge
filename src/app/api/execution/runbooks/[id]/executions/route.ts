// ============================================================================
// GET /api/execution/runbooks/:id/executions - List executions for a runbook
// ============================================================================
//
// P-09 (T-001): the run history of another tenant's runbook -- every step, its
// output and its errors -- was readable by id with no scope at all.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { listRunbookExecutions } from '@/modules/execution/services/runbook-service';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRunbookScope(request, id, async (_req, _session, entityId) => {
    try {
      const executions = await listRunbookExecutions(id, entityId);
      return success(executions);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
