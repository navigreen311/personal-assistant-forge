import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { getCostDashboard } from '@/modules/analytics/services/llm-cost-service';

const querySchema = z.object({
  entityId: z.string().min(1),
  period: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const now = new Date();
      const period =
        parsed.data.period ??
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const dashboard = await getCostDashboard(parsed.data.entityId, period);
      return success(dashboard);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get LLM costs', 500);
    }
  });
}
