import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { evaluateRules, getWinningAction } from '@/engines/policy/rule-engine';

const EvaluateSchema = z.object({
  context: z.record(z.string(), z.unknown()),
  entityId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = EvaluateSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const evaluated = await evaluateRules(parsed.data.context, parsed.data.entityId);
    const winner = getWinningAction(evaluated);

    return success({
      evaluatedRules: evaluated,
      winningRule: winner,
      matchedCount: evaluated.filter((r) => r.matched).length,
      totalEvaluated: evaluated.length,
    });
  } catch (err) {
    return error('INTERNAL_ERROR', (err as Error).message, 500);
  }
}
