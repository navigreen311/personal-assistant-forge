import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as stressService from '@/modules/health/services/stress-service';

const recordSchema = z.object({
  userId: z.string().min(1),
  level: z.number().min(0).max(100),
  source: z.string().min(1),
  triggers: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const days = parseInt(searchParams.get('days') ?? '7', 10);

    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const history = await stressService.getStressHistory(userId, days);
    return success(history);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = recordSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { userId, level, source, triggers } = parsed.data;
    const entry = await stressService.recordStressLevel(userId, level, source, triggers);
    return success(entry, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
