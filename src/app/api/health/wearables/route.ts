import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as wearableService from '@/modules/health/services/wearable-service';

const connectSchema = z.object({
  provider: z.enum(['APPLE_WATCH', 'FITBIT', 'OURA', 'WHOOP', 'GARMIN']),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const connections = await wearableService.getConnections(session.userId);
      return success(connections);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = connectSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const connection = await wearableService.connectWearable(session.userId, parsed.data.provider);
      return success(connection, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
