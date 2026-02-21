import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { listExecutions } from '@/modules/workflows/services/workflow-executor';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      const result = await listExecutions(id, page, pageSize);

      return success({
        data: result.data,
        total: result.total,
        page,
        pageSize,
      });
    } catch (err) {
      return error(
        'LIST_FAILED',
        err instanceof Error ? err.message : 'Failed to list executions',
        500
      );
    }
  });
}
