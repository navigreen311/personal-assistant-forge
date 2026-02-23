// ============================================================================
// Shadow Voice Agent — SMS API Route
// POST: Send SMS from Shadow (authenticated).
// Also handles Twilio inbound SMS webhook (form-encoded From, Body).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { ShadowSMS } from '@/modules/shadow/interfaces/sms';
import { TwiMLBuilder } from '@/modules/shadow/interfaces/twiml-builder';

const sms = new ShadowSMS();

const SendSmsSchema = z.object({
  body: z.string().min(1, 'Message body is required'),
  deepLink: z.string().url().optional(),
});

/**
 * POST /api/shadow/phone/sms
 *
 * Two modes based on Content-Type:
 *   1. application/x-www-form-urlencoded: Twilio inbound SMS webhook.
 *   2. application/json: Authenticated API call to send SMS.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';

  // Mode 1: Twilio inbound SMS webhook (form-encoded)
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return handleInboundSMS(request);
  }

  // Mode 2: Authenticated API call to send SMS
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = SendSmsSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await sms.sendSMS({
        userId: session.userId,
        body: parsed.data.body,
        deepLink: parsed.data.deepLink,
      });

      return success(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message.includes('No phone number found')) {
        return error('NOT_FOUND', message, 404);
      }

      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

/**
 * Handle Twilio inbound SMS webhook.
 * Processes the message and returns TwiML with a response SMS.
 */
async function handleInboundSMS(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const from = formData.get('From')?.toString() ?? '';
    const body = formData.get('Body')?.toString() ?? '';

    if (!from || !body) {
      const builder = new TwiMLBuilder();
      // Return empty response if missing required fields
      return new NextResponse(builder.build(), {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }

    const result = await sms.handleInboundSMS({ from, body });

    // Build TwiML response with SMS reply
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Response>\n' +
      `  <Message>${escapeXml(result.response)}</Message>\n` +
      '</Response>';

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err) {
    console.error('[SmsRoute] Error handling inbound SMS:', err);

    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Response>\n' +
      '  <Message>Sorry, something went wrong processing your message. Please try again.</Message>\n' +
      '</Response>';

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
