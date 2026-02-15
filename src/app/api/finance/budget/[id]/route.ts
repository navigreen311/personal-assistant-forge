import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getBudgetWithActuals } from '@/modules/finance/services/budget-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const budget = await getBudgetWithActuals(id);
    return success(budget);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
