import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as sleepService from '@/modules/health/services/sleep-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const days = parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10);
      const history = await sleepService.getSleepHistory(session.userId, days);
      return success(history);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
