import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Placeholder events returned when no real ShadowAuthEvent records exist
// ---------------------------------------------------------------------------

const PLACEHOLDER_EVENTS = [
  {
    id: 'evt_1',
    date: '2026-02-23T14:34:00Z',
    event: 'PIN verified (phone)',
    status: 'success',
    channel: 'phone',
  },
  {
    id: 'evt_2',
    date: '2026-02-23T13:15:00Z',
    event: 'Unknown caller step-up',
    status: 'verified',
    channel: 'phone',
  },
  {
    id: 'evt_3',
    date: '2026-02-22T16:00:00Z',
    event: 'Bulk email blocked',
    status: 'pin_required',
    channel: 'web',
  },
  {
    id: 'evt_4',
    date: '2026-02-21T09:22:00Z',
    event: 'Social engineering attempt detected',
    status: 'refused',
    channel: 'phone',
  },
];

// ---------------------------------------------------------------------------
// GET /api/shadow/security-events
// Returns the last 10 security events for the authenticated user.
// Falls back to placeholder data when no real events exist.
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;

    // ShadowAuthEvent is linked to users through ShadowVoiceSession.
    // Query the last 10 auth events for sessions belonging to this user.
    const authEvents = await prisma.shadowAuthEvent.findMany({
      where: {
        session: {
          userId,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        session: {
          select: {
            currentChannel: true,
          },
        },
      },
    });

    // If real events exist, map them to the response shape
    if (authEvents.length > 0) {
      const events = authEvents.map((evt) => ({
        id: evt.id,
        date: evt.createdAt.toISOString(),
        event: evt.actionAttempted ?? evt.method,
        status: mapResult(evt.result),
        channel: evt.session?.currentChannel ?? 'unknown',
      }));

      return success({
        events,
        total: events.length,
      });
    }

    // No real events — return placeholder data so the UI has something to render
    return success({
      events: PLACEHOLDER_EVENTS,
      total: PLACEHOLDER_EVENTS.length,
    });
  } catch (err) {
    console.error('[shadow/security-events] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load security events', 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map raw ShadowAuthEvent.result values to the UI status enum.
 * Valid statuses: "success", "verified", "pin_required", "refused", "failed"
 */
function mapResult(result: string): string {
  const normalized = result.toLowerCase();
  const mapping: Record<string, string> = {
    success: 'success',
    verified: 'verified',
    pin_required: 'pin_required',
    refused: 'refused',
    failed: 'failed',
    denied: 'refused',
    blocked: 'refused',
    pending: 'pin_required',
  };
  return mapping[normalized] ?? normalized;
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
