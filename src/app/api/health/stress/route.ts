import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as stressService from '@/modules/health/services/stress-service';

const recordSchema = z.object({
  level: z.number().min(0).max(100),
  source: z.string().min(1),
  triggers: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const days = parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10);
      const history = await stressService.getStressHistory(session.userId, days);
      return success(history);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = recordSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { level, source, triggers } = parsed.data;
      const entry = await stressService.recordStressLevel(session.userId, level, source, triggers);
      return success(entry, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
