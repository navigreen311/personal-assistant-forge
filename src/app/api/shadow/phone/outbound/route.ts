// ============================================================================
// Shadow Voice Agent — Outbound Phone API Route
// POST: Trigger Shadow to call a user.
// Also handles Twilio webhook for answered outbound calls.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { PhoneOutboundHandler } from '@/modules/shadow/interfaces/phone-outbound';

const handler = new PhoneOutboundHandler();

const OutboundCallSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  content: z.string().min(1, 'Content is required'),
});

/**
 * POST /api/shadow/phone/outbound
 *
 * Two modes:
 *   1. Twilio webhook (event=answered query param): Returns TwiML when outbound call connects.
 *   2. API call (JSON body): Authenticated user triggers Shadow to call them.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const event = url.searchParams.get('event');

  // Mode 1: Twilio webhook for call-answered
  if (event === 'answered') {
    return handleCallAnswered(request);
  }

  // Mode 2: Authenticated API call to initiate outbound call
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = OutboundCallSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await handler.callUser({
        userId: session.userId,
        reason: parsed.data.reason,
        priority: parsed.data.priority,
        content: parsed.data.content,
      });

      return success(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Distinguish between client errors (no device, rate limit, window) and server errors
      if (
        message.includes('No trusted phone number') ||
        message.includes('Outside call window') ||
        message.includes('Quiet hours') ||
        message.includes('Rate limit exceeded')
      ) {
        return error('CALL_BLOCKED', message, 422);
      }

      if (message.includes('Twilio not configured')) {
        return error('SERVICE_UNAVAILABLE', 'Phone service not configured', 503);
      }

      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

/**
 * Handle Twilio webhook when an outbound call is answered.
 * Returns TwiML XML.
 */
async function handleCallAnswered(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;

    const url = new URL(request.url);
    const callSid = params.CallSid ?? '';
    const sessionId = url.searchParams.get('sessionId') ?? '';
    const userName = url.searchParams.get('userName') ?? 'there';
    const machineResult = params.AnsweredBy ?? '';

    // Check if voicemail detected
    if (machineResult === 'machine_end_beep' || machineResult === 'machine_end_silence') {
      const userId = url.searchParams.get('userId') ?? '';
      const content = url.searchParams.get('content') ?? '';

      const twiml = await handler.handleVoicemail({
        callSid,
        userId,
        content: decodeURIComponent(content),
      });

      return new NextResponse(twiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
        },
      });
    }

    // Human answered
    const twiml = await handler.handleCallAnswered({
      callSid,
      sessionId,
      userName: decodeURIComponent(userName),
    });

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err) {
    console.error('[OutboundRoute] Error handling call answered:', err);

    const errorTwiml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Response>\n' +
      '  <Say voice="Polly.Matthew">Sorry, something went wrong. I\'ll try again later.</Say>\n' +
      '  <Hangup />\n' +
      '</Response>';

    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  }
}
