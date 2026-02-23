import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // The id param here is the session ID. Verify session ownership.
      const voiceSession = await sessionManager.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this session', 403);
      }

      const outcome = await prisma.shadowSessionOutcome.findUnique({
        where: { sessionId: id },
      });

      if (!outcome) {
        return error('NOT_FOUND', 'No outcome found for this session', 404);
      }

      return success({
        id: outcome.id,
        sessionId: outcome.sessionId,
        decisionsMade: outcome.decisionsMade,
        commitments: outcome.commitments,
        deadlinesSet: outcome.deadlinesSet,
        followUps: outcome.followUps,
        recordsCreated: outcome.recordsCreated,
        recordsUpdated: outcome.recordsUpdated,
        recordsLinked: outcome.recordsLinked,
        extractionConfidence: outcome.extractionConfidence,
        userVerified: outcome.userVerified,
        createdAt: outcome.createdAt,
        session: {
          id: voiceSession.id,
          status: voiceSession.status,
          currentChannel: voiceSession.currentChannel,
          startedAt: voiceSession.startedAt,
          endedAt: voiceSession.endedAt,
          totalDurationSeconds: voiceSession.totalDurationSeconds,
          messageCount: voiceSession.messageCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get outcome';
      return error('GET_FAILED', message, 500);
    }
  });
}
