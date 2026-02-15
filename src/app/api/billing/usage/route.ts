import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { recordUsage, getUsageSummary } from '@/engines/cost/usage-metering';

const RecordUsageSchema = z.object({
  entityId: z.string().min(1),
  metricType: z.enum(['TOKENS', 'VOICE_MINUTES', 'STORAGE_MB', 'WORKFLOW_RUNS', 'API_CALLS']),
  amount: z.number().positive(),
  source: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RecordUsageSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const record = await recordUsage(
      parsed.data.entityId,
      parsed.data.metricType,
      parsed.data.amount,
      parsed.data.source
    );
    return success(record, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to record usage', 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId query param required', 400);
    }

    const startDate = start ? new Date(start) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = end ? new Date(end) : new Date();

    const summary = await getUsageSummary(entityId, startDate, endDate);
    return success(summary);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get usage summary', 500);
  }
}
