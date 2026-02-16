// ============================================================================
// GET /api/execution/runbooks/:id/executions - List executions for a runbook
// ============================================================================

import { success, error } from '@/shared/utils/api-response';
import { listRunbookExecutions } from '@/modules/execution/services/runbook-service';

// --- Handler ---

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const executions = await listRunbookExecutions(id);
    return success(executions);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}
