// ============================================================================
// GET  /api/workflows - List workflows for the entity in scope
// POST /api/workflows - Create a workflow
// ============================================================================
//
// P-09 (T-001): both handlers discarded the session and took `entityId` off the
// request, so a workflow -- an automation that runs actions against records --
// could be created inside another tenant, and any tenant's list was readable.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { createWorkflow, listWorkflows } from '@/modules/workflows/services/workflow-crud';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  // Optional: a client that omits it gets its session's active entity.
  entityId: z.string().optional(),
  graph: z.object({
    nodes: z.array(z.record(z.string(), z.unknown())),
    edges: z.array(z.record(z.string(), z.unknown())),
  }),
  triggers: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createWorkflowSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const workflow = await createWorkflow(
        {
          name: parsed.data.name,
          graph: parsed.data.graph as unknown as WorkflowGraph,
          triggers: parsed.data.triggers as unknown as TriggerNodeConfig[],
        },
        entityId
      );

      return success(workflow, 201);
    } catch (err) {
      return error(
        'CREATE_FAILED',
        err instanceof Error ? err.message : 'Failed to create workflow',
        500
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);
      const status = searchParams.get('status') ?? undefined;
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      const result = await listWorkflows(entityId, { status }, page, pageSize);

      return paginated(result.data, result.total, page, pageSize);
    } catch (err) {
      return error(
        'LIST_FAILED',
        err instanceof Error ? err.message : 'Failed to list workflows',
        500
      );
    }
  });
}
