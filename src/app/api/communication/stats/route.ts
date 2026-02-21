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

      const entityId = parsed.data.entityId;

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

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Count drafts created today
      let draftsToday = 0;
      try {
        draftsToday = await (prisma as any).message.count({
          where: {
            ...(entityId ? { entityId } : {}),
            draftStatus: 'draft',
            createdAt: { gte: startOfDay },
          },
        });
      } catch {
        draftsToday = 0;
      }

      // Count messages sent today
      let sentToday = 0;
      try {
        sentToday = await (prisma as any).message.count({
          where: {
            ...(entityId ? { entityId } : {}),
            draftStatus: 'sent',
            createdAt: { gte: startOfDay },
          },
        });
      } catch {
        sentToday = 0;
      }

      // Pending follow-ups: contacts where cadence is set and not overdue
      let pendingFollowups = 0;
      try {
        const contacts = await (prisma as any).contact.findMany({
          where: {
            ...(entityId ? { entityId } : {}),
            deletedAt: null,
          },
          select: { preferences: true, lastTouch: true },
        });

        for (const contact of contacts) {
          const prefs = (contact.preferences as Record<string, unknown>) ?? {};
          const frequency = prefs.cadenceFrequency as string | undefined;
          if (!frequency || !contact.lastTouch) continue;

          const cadenceDays = getCadenceDays(frequency);
          if (cadenceDays === null) continue;

          const lastTouch = new Date(contact.lastTouch);
          const daysSinceTouch = Math.floor(
            (now.getTime() - lastTouch.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceTouch <= cadenceDays) {
            pendingFollowups++;
          }
        }
      } catch {
        pendingFollowups = 0;
      }

      // Overdue follow-ups: contacts past cadence window
      let overdueFollowups = 0;
      try {
        const contacts = await (prisma as any).contact.findMany({
          where: {
            ...(entityId ? { entityId } : {}),
            deletedAt: null,
          },
          select: { preferences: true, lastTouch: true },
        });

        for (const contact of contacts) {
          const prefs = (contact.preferences as Record<string, unknown>) ?? {};
          const frequency = prefs.cadenceFrequency as string | undefined;
          if (!frequency || !contact.lastTouch) continue;

          const cadenceDays = getCadenceDays(frequency);
          if (cadenceDays === null) continue;

          const lastTouch = new Date(contact.lastTouch);
          const daysSinceTouch = Math.floor(
            (now.getTime() - lastTouch.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceTouch > cadenceDays) {
            overdueFollowups++;
          }
        }
      } catch {
        overdueFollowups = 0;
      }

      // Approval rate: placeholder (would need draft approval tracking)
      const approvalRate = 0;

      return success({
        draftsToday,
        sentToday,
        pendingFollowups,
        overdueFollowups,
        approvalRate,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch communication stats',
        500
      );
    }
  });
}

function getCadenceDays(frequency: string): number | null {
  switch (frequency) {
    case 'DAILY':
      return 1;
    case 'WEEKLY':
      return 7;
    case 'BIWEEKLY':
      return 14;
    case 'MONTHLY':
      return 30;
    case 'QUARTERLY':
      return 90;
    default:
      return null;
  }
}
