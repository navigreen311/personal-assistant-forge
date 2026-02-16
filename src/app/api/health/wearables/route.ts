import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as wearableService from '@/modules/health/services/wearable-service';

const connectSchema = z.object({
  userId: z.string().min(1),
  provider: z.enum(['APPLE_WATCH', 'FITBIT', 'OURA', 'WHOOP', 'GARMIN']),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const connections = await wearableService.getConnections(userId);
    return success(connections);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const connection = await wearableService.connectWearable(parsed.data.userId, parsed.data.provider);
    return success(connection, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
