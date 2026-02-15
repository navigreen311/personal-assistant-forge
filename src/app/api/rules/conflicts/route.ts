import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { evaluateRules, resolveConflicts } from '@/engines/policy/rule-engine';

const ConflictsSchema = z.object({
  context: z.record(z.unknown()),
  entityId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ConflictsSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const evaluated = await evaluateRules(parsed.data.context, parsed.data.entityId);
    const conflicts = resolveConflicts(evaluated);

    return success({
      conflicts,
      hasConflicts: conflicts.length > 0,
      totalConflicts: conflicts.length,
    });
  } catch (err) {
    return error('INTERNAL_ERROR', (err as Error).message, 500);
  }
}
