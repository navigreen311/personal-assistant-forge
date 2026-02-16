import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  getPendingApprovals,
  submitApproval,
} from '@/modules/workflows/services/approval-service';

const submitApprovalSchema = z.object({
  approvalId: z.string().min(1),
  approverId: z.string().min(1),
  approved: z.boolean(),
  comment: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return error('VALIDATION_ERROR', 'userId is required', 400);
    }

    const approvals = await getPendingApprovals(userId);
    return success(approvals);
  } catch (err) {
    return error(
      'FETCH_FAILED',
      err instanceof Error ? err.message : 'Failed to fetch approvals',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = submitApprovalSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const result = await submitApproval(
      parsed.data.approvalId,
      parsed.data.approverId,
      parsed.data.approved,
      parsed.data.comment
    );

    return success(result);
  } catch (err) {
    return error(
      'APPROVAL_FAILED',
      err instanceof Error ? err.message : 'Failed to process approval',
      500
    );
  }
}
