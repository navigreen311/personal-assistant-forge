/**
 * P-42 — what status code Stripe actually receives, and the row behind it.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * `/api/webhooks/stripe` answered 200 on every path, including the one where
 * the handler threw, with a comment saying it did so "so Stripe doesn't retry".
 * P-36 fixed the half of that which was destroying data — a failure no longer
 * marks the event processed — and left the status code as a product decision.
 * The owner made it: return the actual status.
 *
 * A return value cannot prove that. `processWebhookEvent` already returned
 * `{ status: 'failed' }` under the old route, and the route threw that away.
 * Only the response Stripe receives is evidence, so every case below calls the
 * real exported `POST`, with a real HMAC signature, against real Postgres, and
 * asserts `res.status` AND the `InboundWebhookEvent` row.
 *
 * NOTHING IS MOCKED. Not `@/lib/db`, not the webhook module, not the signature
 * verifier. There is no Stripe call to mock — this endpoint is the receiving
 * end, and a signature is an HMAC this test can compute itself.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p42 \
 *        npm run test:db -- stripe-webhook-status
 */

import { createHmac } from 'crypto';

import { NextRequest } from 'next/server';

import { POST as stripeWebhookPOST } from '@/app/api/webhooks/stripe/route';
import {
  MAX_HANDLER_ATTEMPTS,
  registerHandler,
  _resetState,
} from '@/lib/integrations/payments/webhooks';

import { db, setupTestDatabase } from '../helpers/db';

setupTestDatabase();

const SECRET = 'whsec_p42_test_secret';
const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;

beforeEach(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  // Clears the handler registry back to the defaults AND empties the table.
  await _resetState();
});

afterAll(() => {
  if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
});

/** The signature Stripe sends: `t=<unix>,v1=<hmac-sha256 of "t.body">`. */
function signatureFor(body: string, secret = SECRET): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function delivery(payload: unknown, options: { signature?: string | null } = {}): NextRequest {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const signature = options.signature === undefined ? signatureFor(body) : options.signature;
  if (signature !== null) headers['stripe-signature'] = signature;

  return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  });
}

function invoicePaid(eventId: string) {
  return {
    id: eventId,
    type: 'invoice.paid',
    data: { object: { id: `in_${eventId}`, amount_paid: 4200 } },
  };
}

type WebhookBody = {
  received: boolean;
  status?: string;
  attempts?: number;
  retryable?: boolean;
  error?: string;
};

async function row(eventId: string) {
  return db.inboundWebhookEvent.findUnique({
    where: { provider_eventId: { provider: 'stripe', eventId } },
  });
}

// ===========================================================================
// The 2xx cases: work that happened, or work that already had
// ===========================================================================

describe('POST /api/webhooks/stripe — success is 200', () => {
  it('answers 200 when the handler succeeds, and the row says processed', async () => {
    const res = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_ok')));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      received: true,
      status: 'processed',
      attempts: 1,
    });

    const stored = await row('evt_p42_ok');
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe('processed');
    expect(stored!.processedAt).not.toBeNull();
    // The payload Stripe sent is on the row, not just in a log line.
    expect(JSON.stringify(stored!.payload)).toContain('in_evt_p42_ok');
  });

  it('answers 200 for an event type this deployment has no handler for', async () => {
    const res = await stripeWebhookPOST(
      delivery({ id: 'evt_p42_unknown', type: 'radar.early_fraud_warning.created', data: {} })
    );

    // Redelivery cannot register a handler, so asking for one would be a lie.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ received: true, status: 'ignored' });
    expect((await row('evt_p42_unknown'))!.status).toBe('ignored');
  });

  it('answers 200 to a DUPLICATE delivery, and the handler runs exactly once', async () => {
    let runs = 0;
    registerHandler('invoice.paid', async () => {
      runs += 1;
    });

    const first = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_twice')));
    const second = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_twice')));

    expect(first.status).toBe(200);
    // A DUPLICATE IS A SUCCESS. This is the line that says the fix did not turn
    // idempotency into a failure: the second delivery is 200, not 500.
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ received: true, status: 'ignored' });
    expect(runs).toBe(1);

    const stored = await row('evt_p42_twice');
    expect(stored!.status).toBe('processed');
    // A duplicate does not spend an attempt.
    expect(stored!.attempts).toBe(1);
  });
});

// ===========================================================================
// The case this package exists for
// ===========================================================================

describe('POST /api/webhooks/stripe — a failed handler is NOT 200', () => {
  it('answers 500 when the handler throws, so Stripe retries', async () => {
    registerHandler('invoice.paid', async () => {
      throw new Error('ledger unavailable');
    });

    const res = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_boom')));

    // THE ASSERTION THE OWNER ASKED FOR. This was 200 before this package, with
    // `{ received: true }`, while the charge was recorded nowhere.
    expect(res.status).toBe(500);
    const body = (await res.json()) as WebhookBody;
    expect(body).toMatchObject({
      received: false,
      status: 'failed',
      retryable: true,
      attempts: 1,
    });
    expect(body.error).toContain('ledger unavailable');

    const stored = await row('evt_p42_boom');
    expect(stored!.status).toBe('failed');
    expect(stored!.error).toBe('ledger unavailable');
    expect(stored!.processedAt).toBeNull();
    expect(stored!.attempts).toBe(1);
  });

  it('a retry that succeeds is 200, and the row ends processed', async () => {
    let runs = 0;
    registerHandler('invoice.paid', async () => {
      runs += 1;
      if (runs === 1) throw new Error('ledger briefly unavailable');
    });

    const failed = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_recovers')));
    expect(failed.status).toBe(500);

    const retried = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_recovers')));
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toMatchObject({ status: 'processed', attempts: 2 });

    const stored = await row('evt_p42_recovers');
    expect(stored!.status).toBe('processed');
    expect(stored!.attempts).toBe(2);
    expect(stored!.error).toBeNull();
  });

  it('stops asking for retries once the attempt budget is spent', async () => {
    // The poison event. A 500 on every delivery would be answered by three days
    // of Stripe backoff, each one re-running a handler already known to fail.
    let runs = 0;
    registerHandler('invoice.paid', async () => {
      runs += 1;
      throw new Error('ledger permanently unavailable');
    });

    const codes: number[] = [];
    for (let attempt = 0; attempt < MAX_HANDLER_ATTEMPTS + 2; attempt += 1) {
      const res = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_poison')));
      codes.push(res.status);
    }

    // Four invitations, then the delivery that spends the last attempt, then
    // silence. `MAX_HANDLER_ATTEMPTS` is 5, so: 500 x4, then 200 forever.
    expect(codes).toEqual([500, 500, 500, 500, 200, 200, 200]);

    // The handler ran five times, not seven: the two deliveries past the budget
    // never reached it.
    expect(runs).toBe(MAX_HANDLER_ATTEMPTS);

    const stored = await row('evt_p42_poison');
    // Still FAILED. A spent budget must never decay into "processed" — this row
    // is the operator's dead letter, and the 200 is only about Stripe.
    expect(stored!.status).toBe('failed');
    expect(stored!.attempts).toBe(MAX_HANDLER_ATTEMPTS);
    expect(stored!.processedAt).toBeNull();
    expect(stored!.error).toBe('ledger permanently unavailable');

    const last = (await stripeWebhookPOST(delivery(invoicePaid('evt_p42_poison'))).then((r) =>
      r.json()
    )) as WebhookBody;
    expect(last).toMatchObject({ received: true, status: 'failed', retryable: false });
    expect(last.error).toContain('no further retries');
  });
});

// ===========================================================================
// Not handler failures, and so not retry invitations
// ===========================================================================

describe('POST /api/webhooks/stripe — refusals are 400 and write nothing', () => {
  it('refuses an unsigned delivery with 400', async () => {
    const res = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_unsigned'), { signature: null }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ received: false });
    // Not 500: a caller with no signature is not Stripe, and inviting it to
    // retry for three days is a self-inflicted flood.
    expect(await db.inboundWebhookEvent.count()).toBe(0);
  });

  it('refuses a forged signature with 400', async () => {
    const res = await stripeWebhookPOST(
      delivery(invoicePaid('evt_p42_forged'), { signature: 't=1,v1=deadbeef' })
    );

    expect(res.status).toBe(400);
    expect(await db.inboundWebhookEvent.count()).toBe(0);
  });

  it('refuses a correctly signed body that is not a Stripe event with 400', async () => {
    // A genuine signature over a payload with no `id`. The old code read
    // `stripeEvent.id as string`, passed `undefined` to the claim, and turned
    // the resulting Prisma error into `{ received: true }` and a 200.
    const res = await stripeWebhookPOST(delivery({ type: 'invoice.paid', data: {} }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as WebhookBody;
    expect(body.received).toBe(false);
    expect(body.error).toContain('event id');
    expect(await db.inboundWebhookEvent.count()).toBe(0);
  });

  it('refuses a signed event with no type with 400', async () => {
    const res = await stripeWebhookPOST(delivery({ id: 'evt_p42_typeless', data: {} }));

    expect(res.status).toBe(400);
    expect(await db.inboundWebhookEvent.count()).toBe(0);
  });

  it('refuses an unparseable body with 400 even when the signature verifies', async () => {
    const res = await stripeWebhookPOST(delivery('{not json at all'));

    expect(res.status).toBe(400);
    expect(await db.inboundWebhookEvent.count()).toBe(0);
  });

  it('answers 500 when the webhook secret is not configured, and writes nothing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const res = await stripeWebhookPOST(delivery(invoicePaid('evt_p42_nosecret')));

    // 500 and NOT a refusal: the delivery may well be genuine, and Stripe's
    // redelivery after the secret is configured is how it is recovered.
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ received: false });
    expect(await db.inboundWebhookEvent.count()).toBe(0);
  });
});
