import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { shadowAuthManager } from '@/modules/shadow/safety';

const VerifyPinSchema = z.object({
  pin: z.string().min(1, 'PIN is required'),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = VerifyPinSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const isValid = await shadowAuthManager.verifyPin(session.userId, parsed.data.pin);

      if (!isValid) {
        return error('AUTH_FAILED', 'Invalid PIN', 401);
      }

      return success({ verified: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify PIN';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
