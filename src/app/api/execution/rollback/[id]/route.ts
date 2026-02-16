import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withRole } from '@/shared/middleware/auth';
import {
  getRollbackPlan,
  createRollbackPlan,
  executeRollback,
} from '@/modules/execution/services/rollback-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;

      let plan = await getRollbackPlan(id);

      if (!plan) {
        plan = await createRollbackPlan(id);
      }

      return success(plan);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to retrieve rollback plan';
      return error('ROLLBACK_PLAN_ERROR', message, 500);
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRole(request, ['admin', 'owner'], async (req, session) => {
    try {
      const { id } = await params;

      const result = await executeRollback(id);

      return success(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Rollback execution failed';
      return error('ROLLBACK_EXECUTION_ERROR', message, 500);
    }
  });
}
