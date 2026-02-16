import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { getExecution, cancelExecution } from '@/modules/workflows/services/workflow-executor';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { executionId } = await params;
      const execution = await getExecution(executionId);

      if (!execution) {
        return error('NOT_FOUND', `Execution ${executionId} not found`, 404);
      }

      return success(execution);
    } catch (err) {
      return error(
        'FETCH_FAILED',
        err instanceof Error ? err.message : 'Failed to fetch execution',
        500
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { executionId } = await params;
      await cancelExecution(executionId);
      return success({ cancelled: true });
    } catch (err) {
      return error(
        'CANCEL_FAILED',
        err instanceof Error ? err.message : 'Failed to cancel execution',
        500
      );
    }
  });
}
