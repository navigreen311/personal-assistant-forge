import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getUnifiedDashboard } from '@/modules/finance/services/dashboard-service';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  period: z.enum(['this_month', 'last_month', 'this_quarter', 'this_year', 'custom']),
});

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();

  switch (period) {
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterMonth, 1);
      return { start, end: now };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: now };
    }
    case 'custom': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    }
    case 'this_month':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now };
    }
  }
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, period } = parsed.data;

      // Verify entity ownership if entityId is provided
      if (entityId) {
        const entity = await prisma.entity.findUnique({
          where: { id: entityId },
        });

        if (!entity) {
          return error('NOT_FOUND', 'Entity not found', 404);
        }

        if (entity.userId !== session.userId) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
      }

      const { start, end } = getDateRange(period);
      const dashboard = await getUnifiedDashboard(session.userId, {
        start,
        end,
      });

      return success(dashboard);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
