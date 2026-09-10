import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import * as sleepService from '@/modules/health/services/sleep-service';

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const days = parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10);
      const history = await sleepService.getSleepHistory(entityId, days);
      return success(history);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
