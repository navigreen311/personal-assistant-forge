import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId } = parsed.data;

      let entityIds: string[];

      if (entityId) {
        // Verify entity belongs to user
        const entity = await prisma.entity.findFirst({
          where: { id: entityId, userId: session.userId },
        });

        if (!entity) {
          return error('NOT_FOUND', 'Entity not found or access denied', 404);
        }

        entityIds = [entityId];
      } else {
        // Get all user's entity IDs
        const entities = await prisma.entity.findMany({
          where: { userId: session.userId },
          select: { id: true },
        });

        entityIds = entities.map((e) => e.id);
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Each query is individually wrapped in try/catch so one failure
      // (e.g. missing Prisma model) doesn't block the others.

      const safeCount = async (fn: () => Promise<number>): Promise<number> => {
        try {
          return await fn();
        } catch {
          return 0;
        }
      };

      const [
        totalCalls,
        todayCalls,
        connectedCalls,
        activeCampaigns,
        phoneNumbers,
        totalPersonas,
        totalScripts,
      ] = await Promise.all([
        safeCount(() =>
          prisma.voiceCall.count({
            where: { entityId: { in: entityIds } },
          })
        ),
        safeCount(() =>
          prisma.voiceCall.count({
            where: {
              entityId: { in: entityIds },
              createdAt: { gte: startOfToday },
            },
          })
        ),
        safeCount(() =>
          prisma.voiceCall.count({
            where: {
              entityId: { in: entityIds },
              outcome: { in: ['CONNECTED', 'INTERESTED'] },
            },
          })
        ),
        safeCount(() =>
          prisma.voiceCampaign.count({
            where: { entityId: { in: entityIds }, status: 'ACTIVE' },
          })
        ),
        safeCount(() =>
          prisma.phoneNumber.count({
            where: { entityId: { in: entityIds } },
          })
        ),
        safeCount(() =>
          prisma.voicePersona.count({
            where: { entityId: { in: entityIds } },
          })
        ),
        safeCount(() =>
          prisma.voiceScript.count({
            where: { entityId: { in: entityIds } },
          })
        ),
      ]);

      const connectRate = totalCalls > 0
        ? Math.round((connectedCalls / totalCalls) * 100 * 100) / 100
        : 0;

      const stats = {
        totalCalls,
        todayCalls,
        connectRate,
        activeCampaigns,
        phoneNumbers,
        totalPersonas,
        totalScripts,
      };

      return success(stats);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
