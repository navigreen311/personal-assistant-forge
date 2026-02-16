import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import * as sleepService from '@/modules/health/services/sleep-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const days = parseInt(searchParams.get('days') ?? '7', 10);

    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const history = await sleepService.getSleepHistory(userId, days);
    return success(history);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
