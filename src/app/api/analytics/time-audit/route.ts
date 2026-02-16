import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { generateTimeAudit } from '@/modules/analytics/services/time-audit-service';

const querySchema = z.object({
  userId: z.string().min(1).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const userId = parsed.data.userId ?? session.userId;

      const report = await generateTimeAudit(
        userId,
        new Date(parsed.data.start),
        new Date(parsed.data.end)
      );

      return success(report);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to generate time audit', 500);
    }
  });
}
