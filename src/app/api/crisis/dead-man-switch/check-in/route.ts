import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as dmsService from '@/modules/crisis/services/dead-man-switch-service';

const checkInSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = checkInSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const status = await dmsService.checkIn(parsed.data.userId);
    return success(status);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
