// ============================================================================
// GET    /api/execution/queue/:id  - Get a single queued action by ID
// PATCH  /api/execution/queue/:id  - Approve, reject, execute, or schedule
// DELETE /api/execution/queue/:id  - Cancel a queued action
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withRole } from '@/shared/middleware/auth';
import {
  getActionById,
  approveAction,
  rejectAction,
  executeAction,
  scheduleAction,
  cancelAction,
} from '@/modules/execution/services/action-queue';

// --- Validation Schemas ---

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('APPROVE'),
    approverId: z.string().min(1),
  }),
  z.object({
    action: z.literal('REJECT'),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal('EXECUTE'),
  }),
  z.object({
    action: z.literal('SCHEDULE'),
    scheduledFor: z.coerce.date(),
  }),
]);

// --- Handlers ---

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;

      const action = await getActionById(id);
      if (!action) {
        return error('NOT_FOUND', `Action ${id} not found`, 404);
      }

      return success(action);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const body: unknown = await req.json();

      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid request body',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const payload = parsed.data;

      switch (payload.action) {
        case 'APPROVE': {
          const result = await approveAction(id, payload.approverId);
          return success(result);
        }
        case 'REJECT': {
          const result = await rejectAction(id, payload.reason);
          return success(result);
        }
        case 'EXECUTE': {
          const result = await executeAction(id);
          return success(result);
        }
        case 'SCHEDULE': {
          const result = await scheduleAction(id, payload.scheduledFor);
          return success(result);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';

      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      if (message.includes('Cannot')) {
        return error('INVALID_STATE', message, 409);
      }
      if (message.includes('Execution blocked')) {
        return error('GATE_BLOCKED', message, 403);
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

      const result = await cancelAction(id);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';

      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      if (message.includes('Cannot cancel')) {
        return error('INVALID_STATE', message, 409);
      }

      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
