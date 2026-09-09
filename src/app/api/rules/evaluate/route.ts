// ============================================================================
// POST /api/rules/evaluate - Evaluate policy rules against a context
// ============================================================================
//
// P-09 (T-001): the handler discarded the session and passed `entityId`
// straight into the rule engine, so a caller could evaluate against another
// tenant's rule set and read back the rules that matched, their conditions and
// their actions.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { evaluateRules, getWinningAction } from '@/engines/policy/rule-engine';
import { withEntityScope } from '@/shared/middleware/auth';

const EvaluateSchema = z.object({
  context: z.record(z.string(), z.unknown()),
  entityId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = EvaluateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      // The verified entity, not the one in the body.
      const evaluated = await evaluateRules(parsed.data.context, entityId);
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
  });
}
