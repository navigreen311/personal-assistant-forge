import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { rollbackExecution } from '@/modules/workflows/services/execution-logger';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  try {
    const { executionId } = await params;
    const result = await rollbackExecution(executionId);

    return success({
      rolledBack: result.rolledBack.map((s) => s.nodeId),
      failed: result.failed.map((s) => s.nodeId),
    });
  } catch (err) {
    return error(
      'ROLLBACK_FAILED',
      err instanceof Error ? err.message : 'Failed to rollback execution',
      500
    );
  }
}
