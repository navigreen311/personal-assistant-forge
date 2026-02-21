import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { applyDecay } from '@/engines/memory/decay-service';
import { withAuth } from '@/shared/middleware/auth';

const DecaySchema = z.object({
  config: z
    .object({
      shortTermHalfLifeHours: z.number().optional(),
      workingHalfLifeDays: z.number().optional(),
      longTermHalfLifeDays: z.number().optional(),
      episodicHalfLifeDays: z.number().optional(),
      reinforcementBoost: z.number().optional(),
      minimumStrength: z.number().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = DecaySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await applyDecay(session.userId, parsed.data?.config);
      return success(result);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
