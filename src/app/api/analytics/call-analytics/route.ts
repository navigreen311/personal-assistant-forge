import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getCallAnalytics } from '@/modules/analytics/services/call-analytics-service';

const querySchema = z.object({
  entityId: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const analytics = await getCallAnalytics(
      parsed.data.entityId,
      new Date(parsed.data.start),
      new Date(parsed.data.end)
    );
    return success(analytics);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get call analytics', 500);
  }
}
