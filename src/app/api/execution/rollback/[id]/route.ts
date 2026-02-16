import { success, error } from '@/shared/utils/api-response';
import {
  getRollbackPlan,
  createRollbackPlan,
  executeRollback,
} from '@/modules/execution/services/rollback-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await executeRollback(id);

    return success(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Rollback execution failed';
    return error('ROLLBACK_EXECUTION_ERROR', message, 500);
  }
}
