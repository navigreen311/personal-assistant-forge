import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { gdprService } from '@/modules/shadow/compliance/gdpr-export';

/**
 * POST /api/shadow/delete-session/[id]
 *
 * GDPR Article 17 for one conversation. The transcript, the outcome and the
 * session row are deleted; the consent receipt is retained with its content
 * scrubbed and still naming its user. `OwnedSessionStore.deleteById` documents
 * the full list, and it is the single implementation all three delete routes
 * reach.
 *
 * ---------------------------------------------------------------------------
 * P-44 — 403 BECAME 404, AND THE OWNER CHECK MOVED INTO THE ACCESSOR
 * ---------------------------------------------------------------------------
 *
 * Ivan: *"404 on all three paths."*
 *
 * This handler used to read
 *
 *     const voiceSession = await prisma.shadowVoiceSession.findUnique({
 *       where: { id: sessionId }, select: { userId: true },
 *     });
 *     if (!voiceSession)                          return 404;
 *     if (voiceSession.userId !== session.userId) return 403;
 *     await gdprService.deleteSession(sessionId);
 *
 * The check was correct and the distinction was the bug. 403-on-foreign and
 * 404-on-missing make this endpoint an existence oracle for cuids: POST a
 * stranger's session id and the status code tells you whether it exists. P-41
 * found two of these and closed the third (`POST /api/shadow/action`, 403 ->
 * 404); this is one of the two it left.
 *
 * The fix is not to return 404 from the second branch. It is that there is no
 * second branch: `gdprService.deleteSession` takes the owner now and resolves
 * the row through `OwnedSessionStore`, whose `where` carries `userId`, so "not
 * yours" and "not there" are the same query returning null and a later edit
 * cannot make them diverge. P-34's reasoning — the scoping and the refusal are
 * the same act — and the reason this file no longer imports `@/lib/db` at all.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRole(request, ['owner', 'admin'], async (_req, session) => {
    try {
      const { id: sessionId } = await params;

      await gdprService.deleteSession(sessionId, session.userId);
      return success({ deleted: true, sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      // `Session <id> not found` — thrown for a missing row and for another
      // tenant's alike, because the store cannot tell them apart either.
      if (message.includes('not found')) {
        return error('NOT_FOUND', 'Session not found', 404);
      }
      return error('DELETE_SESSION_FAILED', message, 500);
    }
  });
}
