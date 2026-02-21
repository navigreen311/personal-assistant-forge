import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getBudgetWithActuals, updateBudget, deleteBudget } from '@/modules/finance/services/budget-service';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const budget = await getBudgetWithActuals(id);
      return success(budget);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const body = await req.json();

      const budget = await updateBudget(id, body);
      if (!budget) {
        return error('NOT_FOUND', 'Budget not found', 404);
      }

      return success(budget);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;

      const budget = await deleteBudget(id);
      if (!budget) {
        return error('NOT_FOUND', 'Budget not found', 404);
      }

      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
