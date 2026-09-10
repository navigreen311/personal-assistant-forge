// ============================================================================
// GET  /api/execution/rollback/:id - Read (or build) the rollback plan
// POST /api/execution/rollback/:id - Execute the rollback
// ============================================================================
//
// P-09 (T-001): both handlers discarded the session and passed the path id
// straight to the service, so `POST /api/execution/rollback/<any id>` reversed
// another tenant's executed action. The entity is a property of the action row,
// so it is resolved from the row here rather than from the request.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import {
  getRollbackPlan,
  createRollbackPlan,
  executeRollback,
} from '@/modules/execution/services/rollback-service';

async function withActionScope(
  request: NextRequest,
  actionId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.queuedAction.findUnique({
      where: { id: actionId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Action ${actionId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withActionScope(request, id, async (_req, _session, entityId) => {
    try {
      let plan = await getRollbackPlan(id, entityId);

      if (!plan) {
        plan = await createRollbackPlan(id, entityId);
      }

      return success(plan);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to retrieve rollback plan';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('ROLLBACK_PLAN_ERROR', message, 500);
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withActionScope(request, id, async (_req, session, entityId) => {
      if (session.role !== 'admin' && session.role !== 'owner') {
        return error('FORBIDDEN', 'Insufficient permissions', 403);
      }

      try {
        const result = await executeRollback(id, entityId);

        return success(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Rollback execution failed';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('ROLLBACK_EXECUTION_ERROR', message, 500);
      }
    })
  );
}
