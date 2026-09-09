// ============================================================================
// GET /api/execution/timeline/summary - Aggregated activity for one entity
// ============================================================================
//
// P-09 (T-001): required `entityId` and never verified it, then aggregated
// every ActionLog row in the window regardless -- so the summary was both
// unauthorized and, separately, wrong. Both halves are fixed: the entity is
// verified here, and the aggregate is scoped through QueuedAction.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { getActivitySummary } from '@/modules/execution/services/operator-console';

function defaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().split('T')[0];
}

function defaultTo(): string {
  return new Date().toISOString().split('T')[0];
}

const SummaryQuerySchema = z.object({
  entityId: z.string().optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .or(z.string().date())
    .default(defaultFrom),
  to: z
    .string()
    .datetime({ offset: true })
    .or(z.string().date())
    .default(defaultTo),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);
      const rawQuery: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        rawQuery[key] = value;
      });

      const parsed = SummaryQuerySchema.safeParse(rawQuery);

      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid query parameters',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const { from, to } = parsed.data;

      const summary = await getActivitySummary(entityId, {
        from: new Date(from),
        to: new Date(to),
      });

      return success(summary);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to retrieve activity summary';
      return error('SUMMARY_ERROR', message, 500);
    }
  });
}
