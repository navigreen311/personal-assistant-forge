// ============================================================================
// GET  /api/workflows/approvals - The approvals waiting on the caller
// POST /api/workflows/approvals - Answer one
// ============================================================================
//
// P-09 (T-001). This route had BOTH halves of the audit's bug, in the same file.
//
// GET read `?userId=` off the query string -- the second half the tenancy
// pattern warns about, the one that is not in the audit. Anyone could
// enumerate anyone else's pending approvals, including the message, the
// workflow name and the step label of another tenant's automation.
//
// POST read `approverId` off the body. The approver check
// (`config.approverIds.includes(approverId)`) looked like authorization and was
// not: the caller chose which name to be checked against, so any signed-in user
// could cast a valid approval as any named approver. That is the exact shape of
// "the system reports that it is protected" -- a consent receipt pointing at an
// approval nobody made.
//
// Both are the session's user id now. Neither is a parameter any more.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  getPendingApprovals,
  submitApproval,
} from '@/modules/workflows/services/approval-service';

const submitApprovalSchema = z.object({
  approvalId: z.string().min(1),
  // Accepted for backwards compatibility and deliberately ignored.
  approverId: z.string().min(1).optional(),
  approved: z.boolean(),
  comment: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const approvals = await getPendingApprovals(session.userId);
      return success(approvals);
    } catch (err) {
      return error(
        'FETCH_FAILED',
        err instanceof Error ? err.message : 'Failed to fetch approvals',
        500
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = submitApprovalSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await submitApproval(
        parsed.data.approvalId,
        session.userId,
        parsed.data.approved,
        parsed.data.comment
      );

      return success(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to process approval';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      if (message.includes('not an authorized approver')) {
        return error('FORBIDDEN', message, 403);
      }
      return error('APPROVAL_FAILED', message, 500);
    }
  });
}
