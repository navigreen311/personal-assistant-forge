import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getExpensesByCategory } from '@/modules/finance/services/expense-service';
import { withEntityScope } from '@/shared/middleware/auth';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

/** An AGGREGATE: category totals summed across every expense row in scope. */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { startDate, endDate } = parsed.data;
      const categories = await getExpensesByCategory(entityId, {
        start: new Date(startDate),
        end: new Date(endDate),
      });

      return success(categories);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
