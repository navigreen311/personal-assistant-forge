import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

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
      // "all" — Delete all sessions and messages. Keep consent receipts.
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
            prisma.shadowAuthEvent.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            // Detach consent receipts from sessions (keep the receipts)
            prisma.shadowConsentReceipt.updateMany({
              where: { sessionId: { in: sessionIds } },
              data: { sessionId: null },
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
            prisma.shadowAuthEvent.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowConsentReceipt.updateMany({
              where: { sessionId: { in: sessionIds } },
              data: { sessionId: null },
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
            prisma.shadowAuthEvent.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowConsentReceipt.updateMany({
              where: { sessionId: { in: sessionIds } },
              data: { sessionId: null },
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
  return withAuth(req, handlePost);
}
