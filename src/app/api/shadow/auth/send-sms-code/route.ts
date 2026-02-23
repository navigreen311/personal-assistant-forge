import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { shadowAuthManager } from '@/modules/shadow/safety';

export async function POST(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const result = await shadowAuthManager.sendSmsCode(session.userId);

      return success({
        sent: result.sent,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send SMS code';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
