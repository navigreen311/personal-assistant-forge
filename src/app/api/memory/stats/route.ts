import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getMemoryStats } from '@/engines/memory/memory-service';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const stats = await getMemoryStats(session.userId);
      return success(stats);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
