import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = req.nextUrl.searchParams;
      const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10)));
      const offset = Math.max(0, parseInt(params.get('offset') ?? '0', 10));

      // Get all session IDs for the user to scope outcomes
      const userSessions = await prisma.shadowVoiceSession.findMany({
        where: { userId: session.userId },
        select: { id: true },
      });
      const sessionIds = userSessions.map((s) => s.id);

      if (sessionIds.length === 0) {
        return success({ outcomes: [], total: 0, limit, offset });
      }

      const [outcomes, total] = await Promise.all([
        prisma.shadowSessionOutcome.findMany({
          where: { sessionId: { in: sessionIds } },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            session: {
              select: {
                id: true,
                status: true,
                currentChannel: true,
                startedAt: true,
                endedAt: true,
                totalDurationSeconds: true,
                messageCount: true,
              },
            },
          },
        }),
        prisma.shadowSessionOutcome.count({
          where: { sessionId: { in: sessionIds } },
        }),
      ]);

      return success({
        outcomes: outcomes.map((o) => ({
          id: o.id,
          sessionId: o.sessionId,
          decisionsMade: o.decisionsMade,
          commitments: o.commitments,
          deadlinesSet: o.deadlinesSet,
          followUps: o.followUps,
          recordsCreated: o.recordsCreated,
          recordsUpdated: o.recordsUpdated,
          recordsLinked: o.recordsLinked,
          extractionConfidence: o.extractionConfidence,
          userVerified: o.userVerified,
          createdAt: o.createdAt,
          session: o.session,
        })),
        total,
        limit,
        offset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list outcomes';
      return error('LIST_FAILED', message, 500);
    }
  });
}
