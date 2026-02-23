import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { morningBriefingService } from '@/modules/shadow/proactive/morning-briefing';

export async function POST(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const result = await morningBriefingService.deliverBriefing(session.userId);
      return success(result, 201);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to deliver briefing',
        500
      );
    }
  });
}
