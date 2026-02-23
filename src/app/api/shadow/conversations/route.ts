import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = req.nextUrl.searchParams;
      const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10)));
      const offset = Math.max(0, parseInt(params.get('offset') ?? '0', 10));
      const status = params.get('status') ?? undefined;
      const entity = params.get('entity') ?? undefined;
      const includeOutcomes = params.get('includeOutcomes') === 'true';

      // Build where clause
      const where: Record<string, unknown> = { userId: session.userId };
      if (status) {
        where.status = status;
      }
      if (entity) {
        where.activeEntityId = entity;
      }

      // Fetch sessions with related data in a single query
      const [dbSessions, total] = await Promise.all([
        prisma.shadowVoiceSession.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            entity: {
              select: { id: true, name: true },
            },
            ...(includeOutcomes
              ? { outcome: true }
              : {}),
            _count: {
              select: { messages: true },
            },
          },
        }),
        prisma.shadowVoiceSession.count({ where }),
      ]);

      // Also fetch actionsCount (messages with non-empty actionsTaken)
      // We compute this from the messages' actionsTaken JSON field
      const sessionIds = dbSessions.map((s) => s.id);
      const actionsCounts = sessionIds.length > 0
        ? await prisma.shadowMessage.groupBy({
            by: ['sessionId'],
            where: {
              sessionId: { in: sessionIds },
              // We count messages that have tools used as a proxy for actions
              NOT: { toolsUsed: { equals: [] } },
            },
            _count: { id: true },
          })
        : [];

      const actionsCountMap = new Map(
        actionsCounts.map((ac) => [ac.sessionId, ac._count.id]),
      );

      const sessions = dbSessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        status: s.status,
        currentChannel: s.currentChannel,
        channelHistory: s.channelHistory ?? [],
        activeEntityId: s.activeEntityId,
        entityName: s.entity?.name ?? null,
        currentPage: s.currentPage,
        currentWorkflowId: s.currentWorkflowId,
        currentWorkflowStep: s.currentWorkflowStep,
        recordingUrls: s.recordingUrls ?? [],
        fullTranscript: s.fullTranscript,
        aiSummary: s.aiSummary,
        approvals: s.approvals ?? [],
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
        endedAt: s.endedAt,
        totalDurationSeconds: s.totalDurationSeconds,
        messageCount: s.messageCount,
        actionsCount: actionsCountMap.get(s.id) ?? 0,
        outcomes: includeOutcomes
          ? (s as Record<string, unknown>).outcome
            ? [(s as Record<string, unknown>).outcome]
            : []
          : undefined,
      }));

      return success({
        sessions,
        total,
        limit,
        offset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list conversations';
      return error('LIST_FAILED', message, 500);
    }
  });
}
