import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  processWebhookEvent,
  MAX_HANDLER_ATTEMPTS,
} from '@/lib/integrations/payments/webhooks';
import type { WebhookEvent } from '@/lib/integrations/payments/webhooks';

// ============================================================================
// P-42 — THIS ENDPOINT NO LONGER ANSWERS 200 WHEN THE CHARGE FAILED
// ============================================================================
//
// Every path through this file used to end in `NextResponse.json({ received:
// true })`, twice with a comment saying so: "Always return 200 to Stripe so it
// doesn't retry", and, in the catch, "Still return 200 to prevent Stripe
// retries for unexpected errors". The only place in this repository where money
// arrives therefore reported success for a handler that had thrown.
//
// The owner's ruling: "A payment endpoint that returns 200 when the charge
// fails is a production incident waiting to happen. Return the actual status.
// If downstream code depends on the 200, that code is also broken and should
// fail visibly."
//
// WHAT A NON-2XX ACTUALLY DOES, which is the whole reason this is a decision
// and not a typo. Stripe treats any non-2xx as a failed delivery and redelivers
// with exponential backoff for up to three days. That is exactly what a failed
// `invoice.paid` needs — nothing else in this system will ever retry it — and
// exactly what a poison event must not get forever. So the retry invitation is
// budgeted: `processWebhookEvent` returns `retryable`, false once the event has
// spent MAX_HANDLER_ATTEMPTS, and this route asks for a redelivery only while
// it is true. See the header of src/lib/integrations/payments/webhooks.ts.
//
// THE TABLE. What Stripe receives, case by case:
//
//   no `stripe-signature` header                   400   not a delivery
//   signature does not verify                      400   not from Stripe
//   signed body is not a Stripe event (no id/type) 400   retrying cannot fix it
//   STRIPE_WEBHOOK_SECRET not configured           500   fix config, redeliver
//   handler succeeded                              200
//   no handler for this event type                 200   a decision, not a failure
//   duplicate delivery of a handled event          200   the work already happened
//   handler threw, attempts < 5                    500   PLEASE retry
//   handler threw, attempts = 5                    200   budget spent, see the row
//   unexpected error (database down, unreadable)   500   PLEASE retry
//
// The two 400s are deliberately NOT retry invitations. A forged signature and a
// malformed body are not handler failures; redelivering either produces the
// same refusal, and answering 500 to an unsigned request would invite a
// three-day retry storm from anything that can reach this URL.
//
// A 4xx/5xx here carries no `received: true`. `received` is this endpoint's
// claim that it took responsibility for the event, and on those paths it did
// not.

/** Read a Stripe event off a verified payload, or say why it is not one. */
type MalformedBody = { malformed: string };

function isMalformed(value: WebhookEvent | MalformedBody): value is MalformedBody {
  return 'malformed' in value;
}

function dataObjectOf(raw: Record<string, unknown>): Record<string, unknown> {
  const data = raw.data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {};
  const object = (data as Record<string, unknown>).object;
  if (object === null || typeof object !== 'object' || Array.isArray(object)) return {};
  return object as Record<string, unknown>;
}

/**
 * `id` and `type` were read with `as string`, which is how a payload with
 * neither reached `claimEvent` and became a Prisma error in the outer catch —
 * answered, before this package, with 200. They are validated instead.
 */
function readStripeEvent(raw: Record<string, unknown>): WebhookEvent | MalformedBody {
  const { id, type } = raw;
  if (typeof id !== 'string' || id.length === 0) {
    return { malformed: 'event id is missing or not a string' };
  }
  if (typeof type !== 'string' || type.length === 0) {
    return { malformed: 'event type is missing or not a string' };
  }
  return { id, type, data: dataObjectOf(raw), status: 'received' };
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { received: false, error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
      // 500, and the retry is wanted: once the secret is configured, Stripe's
      // redelivery of this event succeeds. Failing open with a 200 here would
      // discard every event that arrived during the misconfiguration.
      return NextResponse.json(
        { received: false, error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Verify signature
    const verification = verifyWebhookSignature({
      payload: rawBody,
      signature,
      secret,
    });

    if (!verification.valid || !verification.event) {
      console.error('[stripe-webhook] Signature verification failed:', verification.error);
      return NextResponse.json(
        { received: false, error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Build webhook event
    const webhookEvent = readStripeEvent(verification.event);
    if (isMalformed(webhookEvent)) {
      console.error('[stripe-webhook] Malformed event body:', webhookEvent.malformed);
      return NextResponse.json(
        { received: false, error: `Malformed event: ${webhookEvent.malformed}` },
        { status: 400 }
      );
    }

    // Process event (route to handler)
    const result = await processWebhookEvent(webhookEvent);

    if (result.status === 'failed') {
      console.error(
        `[stripe-webhook] Handler failed for ${webhookEvent.type} (${webhookEvent.id}), ` +
          `attempt ${result.attempts}/${MAX_HANDLER_ATTEMPTS}, ` +
          `${result.retryable ? 'asking Stripe to retry' : 'retry budget spent'}:`,
        result.error
      );
    }

    // ONE mapping, over `retryable` alone, for every outcome.
    //
    // Written this way because of a mutation test: with the status code chosen
    // inside an `if (result.status === 'failed')` branch, marking a DUPLICATE
    // retryable changed nothing observable at this endpoint, because the branch
    // never ran for one. That mutant survived every route-level case and only a
    // unit test caught it. `retryable` is the contract and this is the only
    // place it is read, so anything the module ever marks retryable is a 500
    // here.
    return NextResponse.json(
      {
        // `received` is the claim that this endpoint has taken the event off
        // Stripe's hands. On a retryable failure it has not.
        received: !result.retryable,
        status: result.status,
        eventId: webhookEvent.id,
        attempts: result.attempts,
        retryable: result.retryable,
        ...(result.status === 'failed' ? { error: result.error } : {}),
      },
      // 500 asks for the redelivery. 200 withdraws the request — because the
      // work is done, because nothing would act on another delivery, or because
      // the attempt budget is gone and the row is waiting for an operator.
      { status: result.retryable ? 500 : 200 }
    );
  } catch (err) {
    console.error('[stripe-webhook] Unexpected error:', (err as Error).message);
    // An unexpected throw means this endpoint does not know whether the work
    // happened. Under the old 200 that ambiguity was resolved as "it did", and
    // the event was gone. 500: ask again.
    return NextResponse.json(
      { received: false, error: 'Webhook processing failed', retryable: true },
      { status: 500 }
    );
  }
}
