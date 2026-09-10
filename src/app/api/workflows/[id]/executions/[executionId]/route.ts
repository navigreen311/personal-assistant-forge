// ============================================================================
// GET    /api/workflows/:id/executions/:executionId - Read one run
// DELETE /api/workflows/:id/executions/:executionId - Cancel one run
// ============================================================================
//
// P-09 (T-001): no scope on either. Cancelling is the interesting one: it is a
// control-plane verb, and anyone who knew an execution id could stop another
// tenant's run mid-flight.
//
// Note that the scope is resolved from the WORKFLOW in the path and the run is
// then required to belong to it. Trusting `:id` alone would let a caller pair
// their own workflow id with someone else's execution id.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { getExecution, cancelExecution } from '@/modules/workflows/services/workflow-executor';

async function withExecutionScope(
  request: NextRequest,
  executionId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const record = await prisma.workflowExecutionRecord.findUnique({
      where: { id: executionId },
      select: { workflowId: true },
    });
    if (!record) {
      return error('NOT_FOUND', `Execution ${executionId} not found`, 404);
    }
    const owner = await prisma.workflow.findUnique({
      where: { id: record.workflowId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Execution ${executionId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  const { executionId } = await params;
  return withExecutionScope(request, executionId, async (_req, _session, entityId) => {
    try {
      const execution = await getExecution(executionId, entityId);

      if (!execution) {
        return error('NOT_FOUND', `Execution ${executionId} not found`, 404);
      }

      return success(execution);
    } catch (err) {
      return error(
        'FETCH_FAILED',
        err instanceof Error ? err.message : 'Failed to fetch execution',
        500
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  const { executionId } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withExecutionScope(request, executionId, async (_req, _session, entityId) => {
      try {
        await cancelExecution(executionId, entityId);
        return success({ cancelled: true });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to cancel execution';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('CANCEL_FAILED', message, 500);
      }
    })
  );
}
