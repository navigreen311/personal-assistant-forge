import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as dmsService from '@/modules/crisis/services/dead-man-switch-service';

const configSchema = z.object({
  userId: z.string().min(1),
  isEnabled: z.boolean(),
  checkInIntervalHours: z.number().min(1),
  triggerAfterMisses: z.number().min(1),
  protocols: z.array(z.object({
    order: z.number(),
    action: z.string(),
    contactId: z.string().optional(),
    contactName: z.string(),
    message: z.string(),
    delayHoursAfterTrigger: z.number(),
  })),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const status = await dmsService.getStatus(userId);
    return success(status);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const config = await dmsService.configure(parsed.data.userId, parsed.data);
    return success(config, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
