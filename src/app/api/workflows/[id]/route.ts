import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from '@/modules/workflows/services/workflow-crud';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';

const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  graph: z
    .object({
      nodes: z.array(z.record(z.string(), z.unknown())),
      edges: z.array(z.record(z.string(), z.unknown())),
    })
    .optional(),
  triggers: z.array(z.record(z.string(), z.unknown())).optional(),
  status: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const workflow = await getWorkflow(id);

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
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
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
      if (parsed.data.graph) updates.graph = parsed.data.graph as unknown as WorkflowGraph;
      if (parsed.data.triggers) updates.triggers = parsed.data.triggers as unknown as TriggerNodeConfig[];

      const workflow = await updateWorkflow(id, updates);
      return success(workflow);
    } catch (err) {
      return error(
        'UPDATE_FAILED',
        err instanceof Error ? err.message : 'Failed to update workflow',
        500
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      await deleteWorkflow(id);
      return success({ archived: true });
    } catch (err) {
      return error(
        'DELETE_FAILED',
        err instanceof Error ? err.message : 'Failed to delete workflow',
        500
      );
    }
  });
}
