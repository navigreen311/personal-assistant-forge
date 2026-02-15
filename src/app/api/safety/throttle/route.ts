import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { checkThrottle, recordAction } from '@/engines/trust-safety/throttle-service';

const RecordSchema = z.object({
  userId: z.string().min(1),
  actionType: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const actionType = searchParams.get('actionType');

    if (!userId || !actionType) {
      return error('VALIDATION_ERROR', 'userId and actionType query params required', 400);
    }

    const status = await checkThrottle(userId, actionType);
    return success(status);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to check throttle status', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RecordSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    await recordAction(parsed.data.userId, parsed.data.actionType);
    const status = await checkThrottle(parsed.data.userId, parsed.data.actionType);
    return success(status, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to record action', 500);
  }
}
