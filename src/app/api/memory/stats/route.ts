import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getMemoryStats } from '@/engines/memory/memory-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');

    if (!userId) {
      return error('VALIDATION_ERROR', 'userId query parameter is required', 400);
    }

    const stats = await getMemoryStats(userId);
    return success(stats);
  } catch (err) {
    return error('INTERNAL_ERROR', (err as Error).message, 500);
  }
}
