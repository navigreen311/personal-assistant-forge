import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { generateTimeAudit } from '@/modules/analytics/services/time-audit-service';

const querySchema = z.object({
  userId: z.string().min(1),
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

    const report = await generateTimeAudit(
      parsed.data.userId,
      new Date(parsed.data.start),
      new Date(parsed.data.end)
    );

    return success(report);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to generate time audit', 500);
  }
}
