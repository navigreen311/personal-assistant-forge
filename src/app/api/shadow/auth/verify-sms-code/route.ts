import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { shadowAuthManager } from '@/modules/shadow/safety';

const VerifySmsCodeSchema = z.object({
  code: z.string().length(6, 'Code must be exactly 6 digits'),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = VerifySmsCodeSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const isValid = await shadowAuthManager.verifySmsCode(session.userId, parsed.data.code);

      if (!isValid) {
        return error('AUTH_FAILED', 'Invalid or expired SMS code', 401);
      }

      return success({ verified: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify SMS code';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
