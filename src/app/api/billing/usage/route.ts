import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { recordUsage, getUsageSummary } from '@/engines/cost/usage-metering';

const RecordUsageSchema = z.object({
  entityId: z.string().min(1).optional(),
  metricType: z.enum(['TOKENS', 'VOICE_MINUTES', 'STORAGE_MB', 'WORKFLOW_RUNS', 'API_CALLS']),
  amount: z.number().positive(),
  source: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = RecordUsageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const record = await recordUsage(
        entityId,
        parsed.data.metricType,
        parsed.data.amount,
        parsed.data.source
      );
      return success(record, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to record usage', 500);
    }
  });
}

/** An AGGREGATE: metered usage and cost summed over a date range. */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);
      const start = searchParams.get('start');
      const end = searchParams.get('end');

      const startDate = start ? new Date(start) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end) : new Date();

      const summary = await getUsageSummary(entityId, startDate, endDate);
      return success(summary);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get usage summary', 500);
    }
  });
}
