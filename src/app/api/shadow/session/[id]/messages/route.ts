import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;

      // Verify session ownership
      const voiceSession = await sessionManager.getSession(id);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }
      if (voiceSession.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this session', 403);
      }

      // Get 'after' param for incremental polling (skip first N messages)
      const afterParam = req.nextUrl.searchParams.get('after');
      const skipCount = afterParam ? parseInt(afterParam, 10) : 0;

      const messages = await prisma.shadowMessage.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: 'asc' },
        skip: isNaN(skipCount) ? 0 : Math.max(0, skipCount),
        take: 50,
        select: {
          id: true,
          role: true,
          content: true,
          contentType: true,
          createdAt: true,
          intent: true,
          toolsUsed: true,
          actionsTaken: true,
        },
      });

      // Map to frontend expected shape
      const mapped = messages.map((m) => ({
        id: m.id,
        role: m.role === 'assistant' ? 'shadow' : m.role,
        content: m.content,
        contentType: m.contentType ?? 'TEXT',
        timestamp: m.createdAt,
        metadata: m.toolsUsed || m.actionsTaken ? { toolsUsed: m.toolsUsed, actionsTaken: m.actionsTaken } : undefined,
      }));

      // Count pending (unread assistant messages could be tracked separately if needed)
      return success(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages';
      return error('FETCH_MESSAGES_FAILED', message, 500);
    }
  });
}
