// ============================================================================
// GET /api/workflows/:id/executions - Run history for one workflow
// ============================================================================
//
// P-09 (T-001): no scope. Another tenant's run history -- every step, its
// inputs, its outputs and its errors -- was readable by workflow id.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { listExecutions } from '@/modules/workflows/services/workflow-executor';

async function withWorkflowScope(
  request: NextRequest,
  workflowId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Workflow ${workflowId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withWorkflowScope(request, id, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      const result = await listExecutions(id, entityId, page, pageSize);

      return success({
        data: result.data,
        total: result.total,
        page,
        pageSize,
      });
    } catch (err) {
      return error(
        'LIST_FAILED',
        err instanceof Error ? err.message : 'Failed to list executions',
        500
      );
    }
  });
}
