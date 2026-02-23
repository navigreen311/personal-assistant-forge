import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { morningBriefingService } from '@/modules/shadow/proactive/morning-briefing';

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const briefing = await morningBriefingService.generateBriefing(session.userId);
      return success(briefing);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to generate briefing',
        500
      );
    }
  });
}
