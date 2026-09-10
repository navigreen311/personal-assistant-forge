import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { generateScorecard } from '@/modules/ai-quality/services/accuracy-scorecard-service';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  period: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const period = parsed.data.period ?? 'latest';
      const scorecard = await generateScorecard(entityId, period);
      return success(scorecard);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to generate scorecard', 500);
    }
  });
}
