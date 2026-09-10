// ============================================================================
// POST /api/workflows/:id/trigger - Start a run of a workflow
// ============================================================================
//
// P-09 (T-001): the most consequential unscoped route in the workflows half.
// It discarded the session, took `triggeredBy` off the body, and started a run
// of whatever workflow id was in the path -- so any authenticated user could
// execute another tenant's automation against that tenant's records, and the
// audit trail recorded whatever name the request supplied.
//
// `triggeredBy` is the authenticated caller now. Stop writing an actor that
// nothing verified.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { executeWorkflow } from '@/modules/workflows/services/workflow-executor';
import { ExecutionHaltedError } from '@/modules/execution/services/execution-gate';

const triggerSchema = z.object({
  // Accepted for backwards compatibility and deliberately ignored.
  triggeredBy: z.string().min(1).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withWorkflowScope(request, id, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = triggerSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const execution = await executeWorkflow(
          id,
          session.userId,
          'MANUAL',
          entityId,
          parsed.data.variables
        );

        return success(execution, 201);
      } catch (err) {
        // P-27 (T-038). A halted tenant is refused here, and it is refused with
        // its own code rather than folded into TRIGGER_FAILED: "the dead man
        // switch stopped you" and "your workflow crashed" are different facts
        // and an operator must not have to read a message to tell them apart.
        // 423 Locked, because the resource is intact and the refusal is
        // temporary -- a check-in lifts it.
        if (err instanceof ExecutionHaltedError) {
          return error(
            'EXECUTION_HALTED',
            `Execution is stopped for entity ${err.entityId}. Check in to resume.`,
            423
          );
        }
        const message =
          err instanceof Error ? err.message : 'Failed to trigger workflow';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('TRIGGER_FAILED', message, 500);
      }
    })
  );
}
