import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { forecastCashFlow } from '@/modules/finance/services/cashflow-service';
import { withEntityScope } from '@/shared/middleware/auth';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(365).default(90),
  startingBalance: z.coerce.number().default(0),
});

/** An AGGREGATE: daily inflow/outflow projections summed from historical rows. */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { days, startingBalance } = parsed.data;
      const forecast = await forecastCashFlow(entityId, startingBalance, days);
      return success(forecast);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
