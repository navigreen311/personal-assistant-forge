import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { advanceApproval } from '@/modules/delegation/services/delegation-service';

const approveSchema = z.object({
  stepOrder: z.number().int().positive(),
  status: z.enum(['APPROVED', 'REJECTED']),
  comments: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
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
  });
}
