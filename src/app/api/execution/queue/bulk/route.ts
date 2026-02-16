// ============================================================================
// POST /api/execution/queue/bulk  - Bulk approve or reject queued actions
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';
import {
  bulkApprove,
  bulkReject,
} from '@/modules/execution/services/action-queue';

// --- Validation Schema ---

const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('APPROVE'),
    actionIds: z.array(z.string().min(1)).min(1),
    approverId: z.string().min(1),
  }),
  z.object({
    action: z.literal('REJECT'),
    actionIds: z.array(z.string().min(1)).min(1),
    reason: z.string().min(1),
  }),
]);

// --- Handler ---

export async function POST(request: NextRequest) {
  return withRole(request, ['admin', 'owner'], async (req, session) => {
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
          const result = await bulkApprove(payload.actionIds, payload.approverId);
          return success(result);
        }
        case 'REJECT': {
          const result = await bulkReject(payload.actionIds, payload.reason);
          return success(result);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
