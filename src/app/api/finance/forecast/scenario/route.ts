import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { runScenario } from '@/modules/finance/services/cashflow-service';
import { withAuth } from '@/shared/middleware/auth';

const adjustmentSchema = z.object({
  type: z.enum(['REVENUE_LOSS', 'REVENUE_GAIN', 'EXPENSE_INCREASE', 'EXPENSE_DECREASE']),
  description: z.string().min(1),
  monthlyAmount: z.number().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
});

const scenarioSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  adjustments: z.array(adjustmentSchema).min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = scenarioSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, name, adjustments } = parsed.data;
      const result = await runScenario(entityId, {
        name,
        adjustments: adjustments.map((a) => ({
          ...a,
          startDate: new Date(a.startDate),
          endDate: a.endDate ? new Date(a.endDate) : undefined,
        })),
      });

      return success(result, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
