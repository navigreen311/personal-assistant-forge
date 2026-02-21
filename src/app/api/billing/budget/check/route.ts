import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { checkBudget } from '@/engines/cost/budget-service';

const CheckBudgetSchema = z.object({
  entityId: z.string().min(1),
  additionalCost: z.number().min(0),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = CheckBudgetSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await checkBudget(parsed.data.entityId, parsed.data.additionalCost);
      return success(result);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to check budget', 500);
    }
  });
}
