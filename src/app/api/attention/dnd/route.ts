import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getDNDConfig, setDND, isDNDActive } from '@/modules/attention/services/dnd-service';

const setDNDSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean().optional(),
  mode: z.enum(['MANUAL', 'FOCUS_HOURS', 'CALENDAR_AWARE', 'SMART']).optional(),
  vipBreakthroughEnabled: z.boolean().optional(),
  vipContactIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('VALIDATION_ERROR', 'userId is required', 400);

    const checkActive = request.nextUrl.searchParams.get('checkActive');
    if (checkActive === 'true') {
      const active = await isDNDActive(userId);
      return success({ userId, isDNDActive: active });
    }

    const config = await getDNDConfig(userId);
    return success(config);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = setDNDSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { userId, ...config } = parsed.data;
    const result = await setDND(userId, config);
    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
