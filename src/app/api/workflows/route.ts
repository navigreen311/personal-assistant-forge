import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { createWorkflow, listWorkflows } from '@/modules/workflows/services/workflow-crud';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  entityId: z.string().min(1),
  graph: z.object({
    nodes: z.array(z.record(z.string(), z.unknown())),
    edges: z.array(z.record(z.string(), z.unknown())),
  }),
  triggers: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = createWorkflowSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const workflow = await createWorkflow({
        name: parsed.data.name,
        entityId: parsed.data.entityId,
        graph: parsed.data.graph as unknown as WorkflowGraph,
        triggers: parsed.data.triggers as unknown as TriggerNodeConfig[],
      });

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
  return withAuth(request, async (req, _session) => {
    try {
      const { searchParams } = new URL(req.url);
      const entityId = searchParams.get('entityId');
      const status = searchParams.get('status') ?? undefined;
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

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
