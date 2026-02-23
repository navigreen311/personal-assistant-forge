// ============================================================================
// Shadow Voice Agent — Inbound Phone API Route
// POST: Twilio webhook for incoming calls and speech input processing.
// Receives form-encoded data, returns TwiML XML (Content-Type: text/xml).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { PhoneInboundHandler } from '@/modules/shadow/interfaces/phone-inbound';

const handler = new PhoneInboundHandler();

/**
 * POST /api/shadow/phone/inbound
 *
 * Twilio webhook endpoint for inbound calls.
 * Handles two flows:
 *   1. Initial call (no SpeechResult) -- authenticate + greet + gather
 *   2. Speech received (SpeechResult present) -- process + respond + gather again
 *   3. Step-up auth (stepUp=true, Digits present) -- verify code
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse Twilio form-encoded body
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;

    // Extract query parameters (used for routing between flows)
    const url = new URL(request.url);
    const callSidParam = url.searchParams.get('callSid');
    const sessionId = url.searchParams.get('sessionId');
    const stepUp = url.searchParams.get('stepUp');
    const fromParam = url.searchParams.get('from');

    // Twilio standard form fields
    const callSid = params.CallSid ?? callSidParam ?? '';
    const from = params.From ?? fromParam ?? '';
    const to = params.To ?? '';
    const speechResult = params.SpeechResult ?? '';
    const confidence = params.Confidence ? parseFloat(params.Confidence) : 0;
    const digits = params.Digits ?? '';

    let twiml: string;

    if (stepUp === 'true' && digits) {
      // Flow 3: Step-up authentication via DTMF code
      twiml = await handler.handleStepUpAuth({
        callSid,
        from: from || params.From || '',
        digits,
      });
    } else if (speechResult && sessionId) {
      // Flow 2: Speech input received during conversation
      twiml = await handler.handleSpeechInput({
        callSid,
        sessionId,
        speechResult,
        confidence,
      });
    } else {
      // Flow 1: Initial incoming call
      twiml = await handler.handleIncomingCall({
        callSid,
        from,
        to,
      });
    }

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err) {
    console.error('[InboundRoute] Error handling inbound call:', err);

    // Return a safe TwiML error response
    const errorTwiml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Response>\n' +
      '  <Say voice="Polly.Matthew">Sorry, something went wrong. Please try again later.</Say>\n' +
      '  <Hangup />\n' +
      '</Response>';

    return new NextResponse(errorTwiml, {
      status: 200, // Twilio expects 200 even on errors
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  }
}
