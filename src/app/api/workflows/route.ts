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
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { createWorkflow, listWorkflows } from '@/modules/workflows/services/workflow-crud';
import {
  workflowGraphSchema,
  workflowTriggerListSchema,
  workflowStatusSchema,
  WorkflowShapeError,
} from '@/modules/workflows/schemas/workflow-shape';

// P-32 (T-039). This schema used to be
//
//     graph: z.object({
//       nodes: z.array(z.record(z.string(), z.unknown())),
//       edges: z.array(z.record(z.string(), z.unknown())),
//     }),
//     triggers: z.array(z.record(z.string(), z.unknown())),
//
// -- which accepts `{ nodes: [{}], edges: [] }` and `[{ nope: 1 }]` -- and the
// handler then wrote `parsed.data.graph as unknown as WorkflowGraph` and
// `parsed.data.triggers as unknown as TriggerNodeConfig[]`: it ASSERTED the two
// shapes it had just declined to check. Both casts are gone, because
// `parsed.data` now has the parsed types. See the schema module's header.
//
// `status` is accepted and IGNORED, as it was before: `createWorkflow` writes
// DRAFT unconditionally and a caller does not get to create an already-ACTIVE
// workflow. It is declared here so that `InlineCreateWorkflowModal`, which
// sends it, gets a validation error for a nonsense status rather than having it
// silently stripped.
const createWorkflowSchema = z.object({
  name: z.string().min(1),
  // Optional: a client that omits it gets its session's active entity.
  entityId: z.string().optional(),
  graph: workflowGraphSchema,
  triggers: workflowTriggerListSchema,
  status: workflowStatusSchema.optional(),
});

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createWorkflowSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const workflow = await createWorkflow(
          {
            name: parsed.data.name,
            graph: parsed.data.graph,
            triggers: parsed.data.triggers,
          },
          entityId
        );

        return success(workflow, 201);
      } catch (err) {
        // The service re-validates, so a shape that got past this route by
        // another door is still refused -- and it is refused as a 400 with the
        // offending field path, not as a 500 that reads like a server fault.
        if (err instanceof WorkflowShapeError) {
          return error('VALIDATION_ERROR', err.message, 400);
        }
        return error(
          'CREATE_FAILED',
          err instanceof Error ? err.message : 'Failed to create workflow',
          500
        );
      }
    })
  );
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
