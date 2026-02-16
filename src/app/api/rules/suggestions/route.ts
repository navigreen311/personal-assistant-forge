import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { detectCorrectionPattern } from '@/engines/policy/rule-suggestion';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;

      const lookbackDays = searchParams.has('lookbackDays')
        ? parseInt(searchParams.get('lookbackDays')!, 10)
        : undefined;

      const suggestions = await detectCorrectionPattern(session.userId, lookbackDays);
      return success(suggestions);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
