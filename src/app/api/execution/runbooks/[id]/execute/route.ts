// ============================================================================
// POST /api/execution/runbooks/:id/execute - Execute a runbook
// ============================================================================

import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { executeRunbook } from '@/modules/execution/services/runbook-service';

// --- Validation Schema ---

const executeRunbookSchema = z.object({
  triggeredBy: z.string().min(1, 'triggeredBy is required'),
});

// --- Handler ---

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();

    const parsed = executeRunbookSchema.safeParse(body);
    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const execution = await executeRunbook(id, parsed.data.triggeredBy);
    return success(execution, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('EXECUTION_ERROR', message, 500);
  }
}
