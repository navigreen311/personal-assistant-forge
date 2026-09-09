import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getAgingReport } from '@/modules/finance/services/invoice-service';
import { withEntityScope } from '@/shared/middleware/auth';

/**
 * An AGGREGATE: outstanding receivables bucketed by age. It returns no invoice
 * rows at all, so an unscoped version leaks a tenant's total exposure without
 * ever failing a single-record 403 test.
 */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const report = await getAgingReport(entityId);
      return success(report);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
