// ============================================================================
// Shadow Voice Agent — Phone Status API Route
// GET:  Check active call status for authenticated user.
// POST: Twilio status callback webhook (form-encoded CallSid, CallStatus).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { PhoneOutboundHandler } from '@/modules/shadow/interfaces/phone-outbound';

const handler = new PhoneOutboundHandler();

// ─── In-Memory Call Status Tracking ────────────────────────────────────────

interface TrackedCall {
  callSid: string;
  userId: string;
  status: string;
  direction: 'inbound' | 'outbound';
  startedAt: Date;
  updatedAt: Date;
  duration?: number;
}

const activeCalls = new Map<string, TrackedCall>();
const userCallIndex = new Map<string, Set<string>>();

export function _resetStatusStore(): void {
  activeCalls.clear();
  userCallIndex.clear();
}

function trackCall(callSid: string, userId: string, status: string, direction: 'inbound' | 'outbound' = 'outbound'): void {
  const existing = activeCalls.get(callSid);

  if (existing) {
    existing.status = status;
    existing.updatedAt = new Date();
  } else {
    activeCalls.set(callSid, {
      callSid,
      userId,
      status,
      direction,
      startedAt: new Date(),
      updatedAt: new Date(),
    });

    // Index by userId
    const userCalls = userCallIndex.get(userId) ?? new Set();
    userCalls.add(callSid);
    userCallIndex.set(userId, userCalls);
  }
}

function getCallsForUser(userId: string): TrackedCall[] {
  const callSids = userCallIndex.get(userId) ?? new Set();
  const calls: TrackedCall[] = [];

  for (const sid of callSids) {
    const call = activeCalls.get(sid);
    if (call) {
      calls.push(call);
    }
  }

  return calls.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * GET /api/shadow/phone/status
 *
 * Authenticated endpoint to check active call status for the current user.
 * Returns all tracked calls (active and recent completed).
 */
export async function GET(request: NextRequest): Promise<Response> {
  return withAuth(request, async (_req, session) => {
    try {
      const calls = getCallsForUser(session.userId);

      // Separate active vs completed
      const activeCalls = calls.filter(
        (c) => !['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(c.status),
      );
      const recentCalls = calls.filter(
        (c) => ['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(c.status),
      ).slice(0, 10);

      return success({
        active: activeCalls.map(formatCallForApi),
        recent: recentCalls.map(formatCallForApi),
      });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

/**
 * POST /api/shadow/phone/status
 *
 * Twilio status callback webhook.
 * Receives form-encoded call status updates.
 * Called for: initiated, ringing, answered, completed, no-answer, busy, failed, canceled.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid')?.toString() ?? '';
    const callStatus = formData.get('CallStatus')?.toString() ?? '';
    const callDuration = formData.get('CallDuration')?.toString();
    const to = formData.get('To')?.toString() ?? '';
    const from = formData.get('From')?.toString() ?? '';

    if (!callSid || !callStatus) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    console.log(`[PhoneStatus] Call ${callSid}: ${callStatus}${callDuration ? ` (${callDuration}s)` : ''}`);

    // Look up user from the existing call tracking or query param
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') ?? '';
    const sessionId = url.searchParams.get('sessionId') ?? undefined;

    // Track the status update
    if (userId) {
      trackCall(callSid, userId, callStatus);

      // Update duration if provided
      if (callDuration) {
        const tracked = activeCalls.get(callSid);
        if (tracked) {
          tracked.duration = parseInt(callDuration, 10);
        }
      }
    }

    // Forward to outbound handler for additional processing
    if (userId) {
      await handler.handleStatusCallback({
        callSid,
        callStatus,
        sessionId,
        userId,
      });
    }

    // Twilio expects 200 OK with empty body for status callbacks
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[PhoneStatus] Error handling status callback:', err);
    // Return 200 even on errors to prevent Twilio retries
    return new NextResponse(null, { status: 200 });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatCallForApi(call: TrackedCall): Record<string, unknown> {
  return {
    callSid: call.callSid,
    userId: call.userId,
    status: call.status,
    direction: call.direction,
    startedAt: call.startedAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
    duration: call.duration ?? null,
  };
}
