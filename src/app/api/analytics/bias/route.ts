import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { detectBias } from '@/modules/ai-quality/services/bias-detection-service';

const querySchema = z.object({
  entityId: z.string().min(1),
  period: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const period = parsed.data.period ?? 'latest';
    const report = await detectBias(parsed.data.entityId, period);
    return success(report);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to detect bias', 500);
  }
}
