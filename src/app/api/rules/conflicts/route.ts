import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { evaluateRules, resolveConflicts } from '@/engines/policy/rule-engine';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const ConflictsSchema = z.object({
  context: z.record(z.string(), z.unknown()),
  entityId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = ConflictsSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const evaluated = await evaluateRules(parsed.data.context, parsed.data.entityId);
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
