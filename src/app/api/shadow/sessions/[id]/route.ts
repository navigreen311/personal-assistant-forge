import { NextRequest } from 'next/server';
import { withRole } from '@/shared/middleware/auth';

import { success, error } from '@/shared/utils/api-response';
import type { AuthSession } from '@/lib/auth/types';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';

// ---------------------------------------------------------------------------
// DELETE /api/shadow/sessions/[id] — delete one session
// ---------------------------------------------------------------------------
//
// THE THIRD DELETION ENTRY POINT, and P-44's card did not know it existed: the
// ruling was written about `delete-session/[id]`, `conversations/[id]` and
// `session-store.deleteById`. Counting the routes rather than the call sites
// found two more, this one and `POST /api/shadow/history/clear`.
//
// It was already right about the status code — a foreign session and a missing
// one both 404 here, from one combined condition — and already right about
// retaining the consent receipt. What it had was a hand-written copy of the
// deletion, the third in the repository, and it disagreed with the other two in
// both directions:
//
//   * it DETACHED the receipt without scrubbing it, so the `reasoning` field —
//     which quotes what the user actually said — survived a deletion the user
//     asked for. Ivan: *"Don't preserve session data under a different label —
//     that's the kind of thing that fails a privacy audit."* A verbatim receipt
//     kept after the transcript is erased is exactly that.
//   * it DELETED the `ShadowAuthEvent` rows, which `gdpr-export` has retained
//     since P-17 and `retention.ts` ages out on the regulatory clock. That is
//     the record of whether a step-up challenge passed.
//
// So the body is gone and the call delegates. One implementation —
// `OwnedSessionStore.deleteById` — reached by all three routes, which is the
// only arrangement in which the ruling cannot be honoured on one path and not
// another. The `$transaction` this file used to own was the one thing worth
// keeping and it moved INTO `deleteById`, so nothing lost atomicity on the way.
// ---------------------------------------------------------------------------

async function handleDelete(
  _req: NextRequest,
  session: AuthSession,
  sessionId: string
): Promise<Response> {
  try {
    // The scope IS the ownership check. `forUser` merges the authenticated user
    // into every where clause, so another tenant's session is indistinguishable
    // from one that does not exist — no branch exists that could tell them
    // apart, which is what stops this endpoint being a cuid existence oracle.
    await sessionManager.forUser(session.userId).deleteSession(sessionId);
    return success({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('not found')) {
      return error('NOT_FOUND', 'Session not found', 404);
    }
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
  return withRole(req, ['owner', 'admin'], (innerReq, session) => handleDelete(innerReq, session, id));
}
