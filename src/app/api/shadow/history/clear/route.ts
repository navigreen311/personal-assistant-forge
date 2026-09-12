import { NextRequest } from 'next/server';
import { withRole } from '@/shared/middleware/auth';

import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';
import { RECEIPT_CONTENT_SCRUB } from '@/modules/shadow/compliance/receipt-retention';

// ---------------------------------------------------------------------------
// WHAT SURVIVES A HISTORY CLEAR — P-44
// ---------------------------------------------------------------------------
//
// The FOURTH place in this repository that deletes Shadow sessions, and the
// second the P-44 card did not know about. It is a bulk clear rather than a
// single-session delete, so it does not delegate to
// `OwnedSessionStore.deleteById` — `deleteById` resolves one row and would mean
// N round trips per mode — but it must agree with it, and it did not.
//
// Two disagreements, both in the direction of keeping too much:
//
//   * the consent receipts were DETACHED AND NOT SCRUBBED. `reasoning` is the
//     field that quotes the conversation — `agent/core.ts` writes the classified
//     user intent into it and the confirmation route writes the phrase the user
//     actually said. Keeping it verbatim after "clear all my history" is session
//     content preserved under a different label, which is the specific thing
//     Ivan's ruling names as what fails a privacy audit. `RECEIPT_CONTENT_SCRUB`
//     is the one definition of what comes out, shared with `gdpr-export` and the
//     store.
//
//   * the `ShadowAuthEvent` rows were DELETED. They are the record of whether a
//     step-up challenge passed or failed, they carry no free text to scrub, they
//     have their own `userId`, `gdpr-export` has retained them since P-17 and
//     `retention.ts` ages them out on the same seven-year clock as a receipt.
//     Their FK is `ON DELETE SET NULL`, so deleting the session detaches them;
//     no statement is needed and the ones that were here are gone.
//
// `recordings_only` touches neither, because it deletes no session.
//
// ---------------------------------------------------------------------------
// Valid clear modes
// ---------------------------------------------------------------------------

const VALID_MODES = ['all', 'recordings_only', 'before_date', 'for_entity'] as const;
type ClearMode = (typeof VALID_MODES)[number];

// ---------------------------------------------------------------------------
// POST /api/shadow/history/clear — Clear history with options
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const { mode, beforeDate, entityId } = body as {
      mode?: string;
      beforeDate?: string | null;
      entityId?: string | null;
    };

    // --- Validate mode ---
    if (!mode || !VALID_MODES.includes(mode as ClearMode)) {
      return error(
        'VALIDATION_ERROR',
        `Invalid or missing mode. Must be one of: ${VALID_MODES.join(', ')}`,
        400
      );
    }

    // --- Validate mode-specific params ---
    if (mode === 'before_date') {
      if (!beforeDate) {
        return error('VALIDATION_ERROR', 'beforeDate is required when mode is "before_date"', 400);
      }
      const parsed = new Date(beforeDate);
      if (isNaN(parsed.getTime())) {
        return error('VALIDATION_ERROR', 'beforeDate must be a valid ISO date string', 400);
      }
    }

    if (mode === 'for_entity') {
      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required when mode is "for_entity"', 400);
      }
    }

    const userId = session.userId;
    let sessionsDeleted = 0;

    switch (mode as ClearMode) {
      // ---------------------------------------------------------------
      // "all" — Delete all sessions and messages. Retain consent receipts.
      // ---------------------------------------------------------------
      case 'all': {
        // Find all session IDs for this user
        const sessions = await prisma.shadowVoiceSession.findMany({
          where: { userId },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);

        if (sessionIds.length > 0) {
          // Delete messages, outcomes, and auth events first (child records)
          await prisma.$transaction([
            prisma.shadowMessage.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowSessionOutcome.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            // P-44. Retained with the conversation content scrubbed out, and
            // detached in the same statement. The auth events are retained too,
            // which is why no `shadowAuthEvent.deleteMany` stands above this
            // line any more. See WHAT SURVIVES, at the top of the file.
            prisma.shadowConsentReceipt.updateMany({
              where: { sessionId: { in: sessionIds } },
              data: { sessionId: null, ...RECEIPT_CONTENT_SCRUB },
            }),
            // Delete the sessions themselves
            prisma.shadowVoiceSession.deleteMany({
              where: { userId },
            }),
          ]);
        }

        sessionsDeleted = sessionIds.length;
        break;
      }

      // ---------------------------------------------------------------
      // "recordings_only" — Null out recording URLs, keep everything else
      // ---------------------------------------------------------------
      case 'recordings_only': {
        const result = await prisma.shadowVoiceSession.updateMany({
          where: { userId },
          data: { recordingUrls: [] },
        });

        // Also clear audioUrl on messages
        const sessions = await prisma.shadowVoiceSession.findMany({
          where: { userId },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);

        if (sessionIds.length > 0) {
          await prisma.shadowMessage.updateMany({
            where: { sessionId: { in: sessionIds } },
            data: { audioUrl: null },
          });
        }

        sessionsDeleted = result.count;
        break;
      }

      // ---------------------------------------------------------------
      // "before_date" — Delete sessions started before the given date
      // ---------------------------------------------------------------
      case 'before_date': {
        const cutoff = new Date(beforeDate!);

        const sessions = await prisma.shadowVoiceSession.findMany({
          where: { userId, startedAt: { lt: cutoff } },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);

        if (sessionIds.length > 0) {
          await prisma.$transaction([
            prisma.shadowMessage.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowSessionOutcome.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            // P-44 — retained, scrubbed, detached. See WHAT SURVIVES above.
            prisma.shadowConsentReceipt.updateMany({
              where: { sessionId: { in: sessionIds } },
              data: { sessionId: null, ...RECEIPT_CONTENT_SCRUB },
            }),
            prisma.shadowVoiceSession.deleteMany({
              where: { userId, startedAt: { lt: cutoff } },
            }),
          ]);
        }

        sessionsDeleted = sessionIds.length;
        break;
      }

      // ---------------------------------------------------------------
      // "for_entity" — Delete sessions for a specific entity
      // ---------------------------------------------------------------
      case 'for_entity': {
        const sessions = await prisma.shadowVoiceSession.findMany({
          where: { userId, activeEntityId: entityId },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);

        if (sessionIds.length > 0) {
          await prisma.$transaction([
            prisma.shadowMessage.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowSessionOutcome.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            // P-44 — retained, scrubbed, detached. See WHAT SURVIVES above.
            prisma.shadowConsentReceipt.updateMany({
              where: { sessionId: { in: sessionIds } },
              data: { sessionId: null, ...RECEIPT_CONTENT_SCRUB },
            }),
            prisma.shadowVoiceSession.deleteMany({
              where: { userId, activeEntityId: entityId },
            }),
          ]);
        }

        sessionsDeleted = sessionIds.length;
        break;
      }
    }

    return success({ cleared: true, sessionsDeleted, mode });
  } catch (err) {
    console.error('[shadow/history/clear] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to clear history', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  return withRole(req, ['owner', 'admin'], handlePost);
}
