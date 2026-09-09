// ============================================================================
// POST /api/workflows/:id/executions/:executionId/rollback
// ============================================================================
//
// P-09 (T-001): no scope. This route reverses the effects of a workflow run,
// and it accepted any execution id from any authenticated caller.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { rollbackExecution } from '@/modules/workflows/services/execution-logger';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  const { executionId } = await params;
  return withExecutionScope(request, executionId, async (_req, _session, entityId) => {
    try {
      const result = await rollbackExecution(executionId, entityId);

      return success({
        rolledBack: result.rolledBack.map((s) => s.nodeId),
        failed: result.failed.map((s) => s.nodeId),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to rollback execution';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('ROLLBACK_FAILED', message, 500);
    }
  });
}
