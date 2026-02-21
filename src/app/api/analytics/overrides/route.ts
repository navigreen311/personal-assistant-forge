import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { recordOverride } from '@/modules/ai-quality/services/override-tracking-service';

const bodySchema = z.object({
  actionId: z.string().min(1),
  userId: z.string().min(1).optional(),
  originalOutput: z.string().min(1),
  overriddenOutput: z.string().min(1),
  reason: z.enum([
    'INCORRECT',
    'INCOMPLETE',
    'WRONG_TONE',
    'POLICY_VIOLATION',
    'PREFERENCE',
    'OTHER',
  ]),
  reasonDetail: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = bodySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const userId = parsed.data.userId ?? session.userId;
      const record = await recordOverride(
        parsed.data.actionId,
        userId,
        parsed.data.originalOutput,
        parsed.data.overriddenOutput,
        parsed.data.reason,
        parsed.data.reasonDetail
      );
      return success(record, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to record override', 500);
    }
  });
}
