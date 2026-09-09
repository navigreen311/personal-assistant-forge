import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import {
  advanceApproval,
  getDelegationForParty,
} from '@/modules/delegation/services/delegation-service';

// P-10/T-001. Was `withAuth(... _session)` with the delegation id taken straight
// off the URL and no ownership check anywhere: any authenticated caller who knew
// an id could approve or reject someone else's work item, and the approval was
// recorded as though the rightful approver had made it.
//
// `getDelegationForParty` returns undefined unless the caller raised the
// delegation, received it, or is named in its approval chain.
const approveSchema = z.object({
  stepOrder: z.number().int().positive(),
  status: z.enum(['APPROVED', 'REJECTED']),
  comments: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuditedAuth(
    request,
    { resource: 'delegation.approve', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session) => {
      try {
        const { id } = await params;
        if (!getDelegationForParty(id, session.userId)) {
          return error('NOT_FOUND', 'Delegation not found', 404);
        }

        const body = await req.json();
        const parsed = approveSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const { stepOrder, status, comments } = parsed.data;
        const delegation = await advanceApproval(id, stepOrder, status, comments);
        return success(delegation);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
