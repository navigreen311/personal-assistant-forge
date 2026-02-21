// ============================================================================
// GET /api/execution/runbooks/:id/executions - List executions for a runbook
// ============================================================================

import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { listRunbookExecutions } from '@/modules/execution/services/runbook-service';

// --- Handler ---

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;

      const executions = await listRunbookExecutions(id);
      return success(executions);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
