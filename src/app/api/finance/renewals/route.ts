import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getRenewalRadar } from '@/modules/finance/services/cashflow-service';
import { withAuth } from '@/shared/middleware/auth';

const querySchema = z.object({
  entityId: z.string().min(1),
  daysAhead: z.coerce.number().int().min(1).max(365).default(90),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, daysAhead } = parsed.data;
      const renewals = await getRenewalRadar(entityId, daysAhead);
      return success(renewals);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
