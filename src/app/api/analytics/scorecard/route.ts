import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { generateScorecard } from '@/modules/ai-quality/services/accuracy-scorecard-service';

const querySchema = z.object({
  entityId: z.string().min(1),
  period: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const period = parsed.data.period ?? 'latest';
      const scorecard = await generateScorecard(parsed.data.entityId, period);
      return success(scorecard);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to generate scorecard', 500);
    }
  });
}
