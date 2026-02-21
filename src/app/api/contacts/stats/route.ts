import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

interface Commitment {
  status?: string;
}

interface Preferences {
  cadenceDays?: number;
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);
      const entityId = searchParams.get('entityId');

      // Find all entities belonging to this user
      const entityWhere: Record<string, unknown> = { userId: session.userId };
      if (entityId) {
        entityWhere.id = entityId;
      }

      const entities = await prisma.entity.findMany({
        where: entityWhere,
        select: { id: true },
      });

      const entityIds = entities.map((e) => e.id);

      if (entityIds.length === 0) {
        return success({
          total: 0,
          avgScore: 0,
          overdueFollowUps: 0,
          openCommitments: 0,
          atRiskCount: 0,
        });
      }

      // Fetch all non-deleted contacts across user's entities
      const contacts = await prisma.contact.findMany({
        where: {
          entityId: { in: entityIds },
          deletedAt: null,
        },
        select: {
          id: true,
          relationshipScore: true,
          lastTouch: true,
          commitments: true,
          preferences: true,
        },
      });

      const total = contacts.length;

      // Average relationship score
      const avgScore =
        total > 0
          ? Math.round(
              (contacts.reduce((sum, c) => sum + c.relationshipScore, 0) / total) * 100
            ) / 100
          : 0;

      const now = new Date();
      let overdueFollowUps = 0;
      let openCommitments = 0;
      let atRiskCount = 0;

      for (const contact of contacts) {
        // Parse preferences for cadence rules
        const prefs = (contact.preferences ?? {}) as Preferences;
        const cadenceDays = prefs.cadenceDays;
        const lastTouch = contact.lastTouch;

        // Calculate days since last touch
        const daysSinceLastTouch = lastTouch
          ? (now.getTime() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24)
          : null;

        // Overdue follow-ups: contacts past their cadence window
        if (cadenceDays && lastTouch && daysSinceLastTouch !== null && daysSinceLastTouch > cadenceDays) {
          overdueFollowUps++;
        }

        // Parse commitments JSON array, count OPEN status
        const commitmentsList = (Array.isArray(contact.commitments)
          ? contact.commitments
          : []) as Commitment[];
        const openCount = commitmentsList.filter((c) => c.status === 'OPEN').length;
        openCommitments += openCount;

        // At-risk: past cadence OR (no cadence AND >30d since last touch)
        const pastCadence =
          cadenceDays && daysSinceLastTouch !== null && daysSinceLastTouch > cadenceDays;
        const noCadenceStale =
          !cadenceDays && daysSinceLastTouch !== null && daysSinceLastTouch > 30;

        if (pastCadence || noCadenceStale) {
          atRiskCount++;
        }
      }

      return success({
        total,
        avgScore,
        overdueFollowUps,
        openCommitments,
        atRiskCount,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch contact stats',
        500
      );
    }
  });
}
