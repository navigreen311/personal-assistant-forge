import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { executeWorkflow } from '@/modules/workflows/services/workflow-executor';

const triggerSchema = z.object({
  triggeredBy: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = triggerSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const execution = await executeWorkflow(
      id,
      parsed.data.triggeredBy,
      'MANUAL',
      parsed.data.variables
    );

    return success(execution, 201);
  } catch (err) {
    return error(
      'TRIGGER_FAILED',
      err instanceof Error ? err.message : 'Failed to trigger workflow',
      500
    );
  }
}
