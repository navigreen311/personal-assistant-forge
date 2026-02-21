// ============================================================================
// GET /api/execution/runbooks/:id    - Get a runbook by ID
// PUT /api/execution/runbooks/:id    - Update a runbook
// DELETE /api/execution/runbooks/:id - Delete a runbook
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withRole } from '@/shared/middleware/auth';
import {
  getRunbook,
  updateRunbook,
  deleteRunbook,
} from '@/modules/execution/services/runbook-service';

// --- Validation Schemas ---

const runbookStepSchema = z.object({
  order: z.number().int().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  actionType: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
  requiresApproval: z.boolean(),
  maxBlastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  continueOnFailure: z.boolean(),
  timeout: z.number().int().positive().optional(),
});

const updateRunbookSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  steps: z.array(runbookStepSchema).min(1).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  schedule: z.string().optional(),
});

// --- Handlers ---

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;

      const runbook = await getRunbook(id);
      if (!runbook) {
        return error('NOT_FOUND', `Runbook ${id} not found`, 404);
      }

      return success(runbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
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
      const body: unknown = await req.json();

      const parsed = updateRunbookSchema.safeParse(body);
      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid request body',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const runbook = await updateRunbook(id, parsed.data);
      return success(runbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRole(request, ['admin', 'owner'], async (_req, _session) => {
    try {
      const { id } = await params;

      await deleteRunbook(id);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
