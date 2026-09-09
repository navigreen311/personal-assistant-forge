// ============================================================================
// POST /api/rules/conflicts - Report conflicting policy rules
// ============================================================================
//
// P-09 (T-001): same shape as /api/rules/evaluate -- the session was discarded
// and `entityId` came off the body, so the conflict report described another
// tenant's rule set.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { evaluateRules, resolveConflicts } from '@/engines/policy/rule-engine';
import { withEntityScope } from '@/shared/middleware/auth';

const ConflictsSchema = z.object({
  context: z.record(z.string(), z.unknown()),
  entityId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = ConflictsSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      // The verified entity, not the one in the body.
      const evaluated = await evaluateRules(parsed.data.context, entityId);
      const conflicts = await resolveConflicts(evaluated);

      return success({
        conflicts,
        hasConflicts: conflicts.length > 0,
        totalConflicts: conflicts.length,
      });
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
