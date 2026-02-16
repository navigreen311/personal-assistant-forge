import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getDNDConfig, setDND, isDNDActive } from '@/modules/attention/services/dnd-service';

const setDNDSchema = z.object({
  isActive: z.boolean().optional(),
  mode: z.enum(['MANUAL', 'FOCUS_HOURS', 'CALENDAR_AWARE', 'SMART']).optional(),
  vipBreakthroughEnabled: z.boolean().optional(),
  vipContactIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const checkActive = req.nextUrl.searchParams.get('checkActive');
      if (checkActive === 'true') {
        const active = await isDNDActive(session.userId);
        return success({ userId: session.userId, isDNDActive: active });
      }

      const config = await getDNDConfig(session.userId);
      return success(config);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = setDNDSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const result = await setDND(session.userId, parsed.data);
      return success(result);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
