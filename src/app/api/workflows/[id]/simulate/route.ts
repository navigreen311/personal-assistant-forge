// ============================================================================
// POST /api/workflows/:id/simulate - Dry-run a workflow
// ============================================================================
//
// P-09 (T-001): no scope. A simulation returns the whole graph -- every step,
// what it would do, and what it would cost -- so this was a full read of
// another tenant's automation for anyone holding an id.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { simulateWorkflow } from '@/modules/workflows/services/simulation-service';

const simulateSchema = z.object({
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
  return withWorkflowScope(request, id, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = simulateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await simulateWorkflow(id, entityId, parsed.data.variables);

      return success(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to simulate workflow';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('SIMULATION_FAILED', message, 500);
    }
  });
}
