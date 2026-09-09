import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { generatePnL } from '@/modules/finance/services/pnl-service';
import { withEntityScope } from '@/shared/middleware/auth';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

/** An AGGREGATE: revenue and expense totals by category, for one entity. */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { startDate, endDate } = parsed.data;
      const pnl = await generatePnL(entityId, {
        start: new Date(startDate),
        end: new Date(endDate),
      });

      return success(pnl);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
