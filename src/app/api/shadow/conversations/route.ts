import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = req.nextUrl.searchParams;
      const limit = parseInt(params.get('limit') ?? '20', 10);
      const offset = parseInt(params.get('offset') ?? '0', 10);
      const status = params.get('status') ?? undefined;

      const result = await sessionManager.listSessions(session.userId, {
        limit,
        offset,
        status,
      });

      return success({
        sessions: result.sessions,
        total: result.total,
        limit,
        offset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list conversations';
      return error('LIST_FAILED', message, 500);
    }
  });
}
