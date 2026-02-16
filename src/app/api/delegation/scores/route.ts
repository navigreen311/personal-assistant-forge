import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getScoreboard } from '@/modules/delegation/services/delegation-scoring-service';

export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);

    const scoreboard = await getScoreboard(entityId);
    return success(scoreboard);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
