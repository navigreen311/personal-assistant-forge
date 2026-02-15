import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { recordOverride } from '@/modules/ai-quality/services/override-tracking-service';

const bodySchema = z.object({
  actionId: z.string().min(1),
  userId: z.string().min(1),
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
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const record = await recordOverride(
      parsed.data.actionId,
      parsed.data.userId,
      parsed.data.originalOutput,
      parsed.data.overriddenOutput,
      parsed.data.reason,
      parsed.data.reasonDetail
    );
    return success(record, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to record override', 500);
  }
}
