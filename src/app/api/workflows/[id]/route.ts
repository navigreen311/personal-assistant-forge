// ============================================================================
// GET    /api/workflows/:id - Read a workflow
// PUT    /api/workflows/:id - Update a workflow
// DELETE /api/workflows/:id - Archive a workflow
// ============================================================================
//
// P-09 (T-001): none of the three had any tenant scope, and the service they
// called used `prisma.workflow.update({ where: { id } })` -- a unique WHERE
// with no entity in it. Any authenticated caller who knew a workflow id could
// re-graph another tenant's automation, i.e. change what it will do to their
// records the next time it runs, or archive it outright.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import {
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from '@/modules/workflows/services/workflow-crud';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';
import {
  workflowGraphSchema,
  workflowTriggerListSchema,
  workflowStatusSchema,
  WorkflowShapeError,
} from '@/modules/workflows/schemas/workflow-shape';

// P-32 (T-039). `status: z.string().optional()` was the whole of the status
// check, so `PUT { status: 'ACTVIE' }` returned 200, stored 'ACTVIE', and the
// workflow was then invisible to `syncCronTriggers` (which registers a repeat
// only for ACTIVE), to `processCronTriggerJob` (which refuses anything else)
// and to `domain-event-worker` (which queries `{ status: 'ACTIVE' }`). It never
// ran again, and nothing anywhere said so. The graph and trigger schemas were
// the same unchecked `z.record` pair as the create route, followed by the same
// two `as unknown as` assertions.
const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  graph: workflowGraphSchema.optional(),
  triggers: workflowTriggerListSchema.optional(),
  status: workflowStatusSchema.optional(),
});

// --- Local scope resolver ---

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
  return withWorkflowScope(request, id, async (_req, _session, entityId) => {
    try {
      const workflow = await getWorkflow(id, entityId);

      if (!workflow) {
        return error('NOT_FOUND', `Workflow ${id} not found`, 404);
      }

      return success(workflow);
    } catch (err) {
      return error(
        'FETCH_FAILED',
        err instanceof Error ? err.message : 'Failed to fetch workflow',
        500
      );
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withWorkflowScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = updateWorkflowSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const updates: {
          name?: string;
          graph?: WorkflowGraph;
          triggers?: TriggerNodeConfig[];
          status?: string;
        } = {};

        if (parsed.data.name) updates.name = parsed.data.name;
        if (parsed.data.status) updates.status = parsed.data.status;
        if (parsed.data.graph) updates.graph = parsed.data.graph;
        if (parsed.data.triggers) updates.triggers = parsed.data.triggers;

        const workflow = await updateWorkflow(id, updates, entityId);
        return success(workflow);
      } catch (err) {
        if (err instanceof WorkflowShapeError) {
          return error('VALIDATION_ERROR', err.message, 400);
        }
        const message =
          err instanceof Error ? err.message : 'Failed to update workflow';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('UPDATE_FAILED', message, 500);
      }
    })
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withWorkflowScope(request, id, async (_req, _session, entityId) => {
      try {
        await deleteWorkflow(id, entityId);
        return success({ archived: true });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete workflow';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('DELETE_FAILED', message, 500);
      }
    })
  );
}
