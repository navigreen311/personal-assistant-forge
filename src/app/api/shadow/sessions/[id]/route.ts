import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// DELETE /api/shadow/sessions/[id] — Delete an individual session
// ---------------------------------------------------------------------------

async function handleDelete(
  _req: NextRequest,
  session: AuthSession,
  sessionId: string
): Promise<Response> {
  try {
    const userId = session.userId;

    // Look up the session and verify ownership
    const voiceSession = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!voiceSession || voiceSession.userId !== userId) {
      return error('NOT_FOUND', 'Session not found', 404);
    }

    // Delete child records; keep consent receipts (detach them)
    await prisma.$transaction([
      prisma.shadowMessage.deleteMany({
        where: { sessionId },
      }),
      prisma.shadowSessionOutcome.deleteMany({
        where: { sessionId },
      }),
      prisma.shadowAuthEvent.deleteMany({
        where: { sessionId },
      }),
      // Detach consent receipts from this session (regulatory compliance)
      prisma.shadowConsentReceipt.updateMany({
        where: { sessionId },
        data: { sessionId: null },
      }),
      // Delete the session itself
      prisma.shadowVoiceSession.delete({
        where: { id: sessionId },
      }),
    ]);

    return success({ deleted: true });
  } catch (err) {
    console.error('[shadow/sessions/[id]] DELETE error:', err);
    return error('INTERNAL_ERROR', 'Failed to delete session', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return withAuth(req, (innerReq, session) => handleDelete(innerReq, session, id));
}
