// ============================================================================
// POST /api/execution/queue/bulk  - Bulk approve or reject queued actions
// ============================================================================
//
// P-09 (T-001): the bulk route was the worst shape of the bug. It discarded the
// session, took a list of ids with no tenant scope, and took `approverId` off
// the body -- so one request could approve an arbitrary set of another tenant's
// pending actions, in a name of the caller's choosing.
//
// Now: the entity is verified once, every id is scoped to it inside the
// service, and a foreign id simply counts as `failed`. Nothing is written.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import {
  bulkApprove,
  bulkReject,
} from '@/modules/execution/services/action-queue';

// --- Validation Schema ---

const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('APPROVE'),
    actionIds: z.array(z.string().min(1)).min(1),
    // Accepted for backwards compatibility and deliberately ignored.
    approverId: z.string().min(1).optional(),
    entityId: z.string().optional(),
  }),
  z.object({
    action: z.literal('REJECT'),
    actionIds: z.array(z.string().min(1)).min(1),
    reason: z.string().min(1),
    entityId: z.string().optional(),
  }),
]);

// --- Handler ---

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    if (session.role !== 'admin' && session.role !== 'owner') {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const body: unknown = await req.json();

      const parsed = bulkActionSchema.safeParse(body);
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
          const result = await bulkApprove(
            payload.actionIds,
            session.userId,
            entityId
          );
          return success(result);
        }
        case 'REJECT': {
          const result = await bulkReject(
            payload.actionIds,
            payload.reason,
            entityId
          );
          return success(result);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
