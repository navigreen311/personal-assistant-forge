import { createHmac, timingSafeEqual } from 'crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

// P-36 (ESC-1, migration window 01) — the idempotency guard was a `Set`.
//
//   const processedEventIds = new Set<string>();   // :28
//   const eventHistory: WebhookEvent[] = [];       // :29
//
// `/api/webhooks/stripe` is the only place in this repository where money
// arrives. A restart emptied that Set, so every event Stripe replayed after a
// deploy ran its handler a second time; a second instance behind a load
// balancer did not even need the restart, because each process kept its own
// Set. Both are now rows in `InboundWebhookEvent`.
//
// THE UNIQUE INDEX IS THE POINT, NOT THE TABLE.
//
// `isEventProcessed(id)` followed by `markEventProcessed(id)` is a
// read-then-write race however durable the storage is: two concurrent
// deliveries of one event both read "not processed" and both run the handler.
// So the claim here is an INSERT against `@@unique([provider, eventId])`, and a
// duplicate is a `P2002` raised by Postgres — the database refuses the second
// writer, rather than this code hoping to have seen the first. That is the
// whole argument P-33 made for a new table over `ActionLog`, which has no
// unique constraint on any business key.
//
// WHAT THE `status` COLUMN FIXED (P-33's defect #1, webhooks.ts:138).
//
// The old code called `markEventProcessed(event.id)` on the FAILURE branch.
// Combined with the route returning 200 unconditionally "so Stripe doesn't
// retry", a handler failure on `invoice.paid` was dropped permanently: the
// payment was never recorded, and every Stripe retry was answered `ignored`
// because the id was already in the Set. There was no third state to record —
// the Set is a boolean. `status` gives one: a failure is written `failed`, and
// a later delivery of that same event re-claims it and runs the handler again.
//
// P-42 — THE DECISION P-36 LEFT OPEN, NOW MADE BY THE OWNER.
//
// P-33's defect #2 was whether the route may answer 200 when the handler
// failed. The owner's ruling: "A payment endpoint that returns 200 when the
// charge fails is a production incident waiting to happen. Return the actual
// status." So `/api/webhooks/stripe` now answers non-2xx on a handler failure
// and Stripe retries with backoff, which is the only mechanism that recovers a
// failed `invoice.paid`.
//
// Non-2xx is a REQUEST for redelivery, so it cannot be unconditional: a poison
// event that always throws would be retried until Stripe gave up, and every one
// of those deliveries re-runs a handler already known to fail. `attempts` is the
// budget for that, and MAX_HANDLER_ATTEMPTS below is where it is spent. Past
// the budget the endpoint stops asking: it answers 200, leaves the row
// `failed`, and the event waits for an operator rather than for Stripe.
//
// What this module reports, and what the route does with it, are two things.
// `processWebhookEvent` returns `retryable`; the route turns that into a status
// code. Nothing here knows about HTTP.
//
// KNOWN LIMIT, stated rather than hidden: a row stuck at `status='received'`
// means the process was killed between the claim and the handler, and later
// deliveries of that event are refused as duplicates. A thrown handler is not
// this case — that writes `failed` and is retryable. Recovery query:
//
//   SELECT * FROM "InboundWebhookEvent"
//    WHERE status = 'received' AND "createdAt" < now() - interval '1 hour';
//
// Under the Set, the equivalent state was invisible and unrecoverable.

// --- Types ---

export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  processedAt?: Date;
  status: 'received' | 'processed' | 'failed' | 'ignored';
  error?: string;
}

export type StripeEventType =
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'checkout.session.completed'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed';

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

/**
 * The outcome of one delivery, and whether another one is wanted.
 *
 * `retryable` is the field the route turns into a status code. It is a separate
 * field rather than a sixth `status` value because the row's status and the
 * answer to Stripe are different questions: a `failed` row is retryable up to
 * the budget and not retryable past it, and the row reads `failed` either way.
 */
export interface WebhookProcessResult {
  status: 'processed' | 'failed' | 'ignored';
  error?: string;
  /**
   * True only when this module wants the provider to deliver the event again.
   * A processed event, an ignored event, a duplicate and a failure that has
   * spent its attempt budget are all false.
   */
  retryable: boolean;
  /** How many times this event has been handed to a handler, this one included. */
  attempts: number;
}

// --- Internal State ---

/** The provider these rows belong to. `@@unique([provider, eventId])` namespaces
 *  Stripe's ids so a second provider can be added without collision. */
const PROVIDER = 'stripe';

/**
 * How many times one event may be handed to a handler before this endpoint
 * stops asking the provider to send it again.
 *
 * FIVE, and the number is a judgement rather than a measurement: Stripe retries
 * a failed delivery with exponential backoff for up to three days, so five
 * attempts spans hours — long enough for a transient outage of the ledger, the
 * database or a downstream API to end on its own, and short enough that a
 * genuinely poison event stops burning handler runs early on the first day.
 *
 * The budget is spent in `claimEvent`: a re-claim of a `failed` row is guarded
 * on `attempts < MAX_HANDLER_ATTEMPTS`, so the guard is in the same atomic
 * `updateMany` as the status guard and two concurrent retries cannot spend the
 * last attempt twice. Past the budget the row stays `failed` with `attempts`
 * pinned at the maximum and the handler is not run again:
 *
 *   SELECT * FROM "InboundWebhookEvent"
 *    WHERE status = 'failed' AND attempts >= 5;
 *
 * is the operator's dead-letter queue, and replaying one is
 * `UPDATE ... SET attempts = 0` — deliberately a human act, because a handler
 * that failed five times is a bug report, not a retry.
 */
export const MAX_HANDLER_ATTEMPTS = 5;

// Handlers stay in memory deliberately: they are CODE, registered at import by
// `registerDefaultHandlers()`. A restart rebuilds them identically, which is
// exactly what a Set of event ids could not do.
const handlers = new Map<string, WebhookHandler>();

/** Exposed for testing: re-registers handlers and clears the event table. */
export async function _resetState(): Promise<void> {
  handlers.clear();
  await prisma.inboundWebhookEvent.deleteMany({ where: { provider: PROVIDER } });
  registerDefaultHandlers();
}

// --- Signature Verification ---

export function verifyWebhookSignature(params: {
  payload: string | Buffer;
  signature: string;
  secret: string;
}): { valid: boolean; event?: Record<string, unknown>; error?: string } {
  const { payload, signature, secret } = params;

  if (!signature) {
    return { valid: false, error: 'Missing signature' };
  }

  try {
    // Stripe signature format: t=<timestamp>,v1=<hash>
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const timestamp = timestampPart.slice(2);
    const expectedSig = signaturePart.slice(3);

    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');
    const signedPayload = `${timestamp}.${payloadStr}`;
    const computedSig = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // Timing-safe comparison
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const computedBuf = Buffer.from(computedSig, 'hex');

    if (expectedBuf.length !== computedBuf.length) {
      return { valid: false, error: 'Signature mismatch' };
    }

    const valid = timingSafeEqual(expectedBuf, computedBuf);
    if (!valid) {
      return { valid: false, error: 'Signature mismatch' };
    }

    const event = JSON.parse(payloadStr) as Record<string, unknown>;
    return { valid: true, event };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${(err as Error).message}` };
  }
}

// --- Handler Registration ---

export function registerHandler(eventType: StripeEventType, handler: WebhookHandler): void {
  handlers.set(eventType, handler);
}

// --- Idempotency ---

// The only duplicate detection in this module. There is deliberately no
// "check, then write": `@@unique([provider, eventId])` is the check.
/**
 * The database refused the write because a unique index already holds this row.
 *
 * Written as a CODE check with an `instanceof` fast path rather than
 * `instanceof` alone, mirroring `errorCodeOf` in
 * lib/observability/prisma-instrumentation.ts. `instanceof` compares class
 * identity, and class identity is per module instance: a `jest.resetModules()`
 * restart -- the very thing tests/db/migration-window-01.test.ts uses to prove
 * this table survives one -- hands the re-imported module a NEW
 * `@prisma/client` while the client itself is the `globalThis` singleton
 * created under the old one. The error is then a `PrismaClientKnownRequestError`
 * that fails `instanceof PrismaClientKnownRequestError`, the P2002 branch is
 * skipped, and a duplicate webhook delivery becomes an unhandled 500 instead of
 * an `ignored`. Found by that test, which is the argument for writing it.
 */
function prismaErrorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2002';
}

/** Terminal states. A later delivery of an event in one of these is a duplicate. */
const TERMINAL = ['processed', 'ignored'];

/**
 * Has this event already been dealt with?
 *
 * NOTE for callers: this is a REPORT, not a guard. Nothing in
 * `processWebhookEvent` consults it, because a check followed by a write is the
 * race the unique index exists to close. It is exported for operators and tests.
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const row = await prisma.inboundWebhookEvent.findUnique({
    where: { provider_eventId: { provider: PROVIDER, eventId } },
    select: { status: true },
  });
  return row !== null && TERMINAL.includes(row.status);
}

/** Record an event as terminally handled, creating the row if it is absent. */
export async function markEventProcessed(
  eventId: string,
  status: 'processed' | 'ignored' = 'processed'
): Promise<void> {
  const now = new Date();
  await prisma.inboundWebhookEvent.upsert({
    where: { provider_eventId: { provider: PROVIDER, eventId } },
    create: {
      provider: PROVIDER,
      eventId,
      type: 'unknown',
      payload: {},
      status,
      attempts: 1,
      processedAt: now,
    },
    update: { status, processedAt: now, error: null },
  });
}

// --- Event Processing ---

/**
 * JSONB input. `JSON.parse(JSON.stringify(...))` is this repo's idiom for the
 * conversion (see engines/adoption/coaching-service.ts) and it is also the
 * honest one: it drops `undefined` and functions, which is exactly what a JSONB
 * column cannot store. The alternative in use elsewhere is
 * `as unknown as Prisma.InputJsonValue`, which asserts a shape rather than
 * producing it.
 */
function toJsonPayload(data: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(data ?? {})) as Prisma.InputJsonValue;
}

type Claim =
  /** This delivery owns the event and must run the handler. */
  | { claim: 'claimed'; attempts: number }
  /** Someone else already dealt with it. Nothing to do, and nothing to retry. */
  | { claim: 'duplicate'; attempts: number }
  /**
   * P-42. The event is `failed` and has spent its attempt budget. The handler
   * is NOT run again and the provider is no longer asked to redeliver.
   */
  | { claim: 'exhausted'; attempts: number; error: string | null };

/**
 * Take exclusive ownership of an event, or discover that someone already has.
 *
 * The INSERT is the claim. Whichever of two concurrent deliveries reaches
 * Postgres first creates the row; the other is rejected with P2002 and takes
 * the duplicate branch. There is no window between a check and a write, because
 * there is no check.
 *
 * A row already in `failed` is re-claimed — that is the fix for the defect where
 * a failed handler was marked processed and the event lost. The re-claim is an
 * `updateMany` guarded on `status: 'failed'` so that it, too, is atomic: two
 * concurrent retries cannot both take it.
 *
 * P-42 adds `attempts < MAX_HANDLER_ATTEMPTS` to that same guard, which is the
 * only place it can go and stay atomic. Reading `attempts` and then deciding
 * would be the read-then-write race this whole module is written to avoid: two
 * concurrent retries of an event on its last attempt would both read 4 and both
 * run the handler.
 */
async function claimEvent(event: WebhookEvent): Promise<Claim> {
  try {
    const created = await prisma.inboundWebhookEvent.create({
      data: {
        provider: PROVIDER,
        eventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data),
        status: 'received',
        attempts: 1,
      },
      select: { attempts: true },
    });
    return { claim: 'claimed', attempts: created.attempts };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const retaken = await prisma.inboundWebhookEvent.updateMany({
      where: {
        provider: PROVIDER,
        eventId: event.id,
        status: 'failed',
        attempts: { lt: MAX_HANDLER_ATTEMPTS },
      },
      data: {
        status: 'received',
        error: null,
        type: event.type,
        payload: toJsonPayload(event.data),
        attempts: { increment: 1 },
      },
    });

    // Read AFTER the claim attempt, so `attempts` is the count this delivery
    // was given rather than the one it raced.
    const row = await prisma.inboundWebhookEvent.findUnique({
      where: { provider_eventId: { provider: PROVIDER, eventId: event.id } },
      select: { status: true, attempts: true, error: true },
    });
    const attempts = row?.attempts ?? MAX_HANDLER_ATTEMPTS;

    if (retaken.count === 1) return { claim: 'claimed', attempts };

    // Not re-claimed, and still `failed`: the budget is gone. Distinguished from
    // a duplicate because they are different answers to Stripe — a duplicate is
    // a success that already happened, this is a failure nobody will retry.
    if (row && row.status === 'failed' && row.attempts >= MAX_HANDLER_ATTEMPTS) {
      return { claim: 'exhausted', attempts, error: row.error };
    }

    return { claim: 'duplicate', attempts };
  }
}

/** Write the outcome onto the row this delivery claimed. */
async function settle(
  eventId: string,
  status: 'processed' | 'failed' | 'ignored',
  error?: string
): Promise<void> {
  await prisma.inboundWebhookEvent.updateMany({
    where: { provider: PROVIDER, eventId },
    data: {
      status,
      error: error ?? null,
      processedAt: status === 'failed' ? null : new Date(),
    },
  });
}

export async function processWebhookEvent(event: WebhookEvent): Promise<WebhookProcessResult> {
  const claim = await claimEvent(event);

  if (claim.claim === 'duplicate') {
    event.status = 'ignored';
    // A DUPLICATE IS A SUCCESS. The work happened on an earlier delivery, so
    // asking for another one would be asking for nothing. The wording is
    // unchanged from P-36 because `isEventProcessed` and two suites assert it.
    return {
      status: 'ignored',
      error: 'Event already processed',
      retryable: false,
      attempts: claim.attempts,
    };
  }

  if (claim.claim === 'exhausted') {
    event.status = 'failed';
    const errorMessage =
      `${claim.error ?? 'Handler failed'} ` +
      `(no further retries: ${claim.attempts} of ${MAX_HANDLER_ATTEMPTS} attempts spent)`;
    event.error = errorMessage;
    // Deliberately no write: the row already says `failed` with the attempts
    // pinned, and overwriting `error` on every later delivery would bury the
    // message from the attempt that actually ran.
    return {
      status: 'failed',
      error: errorMessage,
      retryable: false,
      attempts: claim.attempts,
    };
  }

  const handler = handlers.get(event.type);
  if (!handler) {
    event.status = 'ignored';
    await settle(event.id, 'ignored');
    // Not retryable: no amount of redelivery will register a handler. An event
    // type this deployment does not implement is a decision, not a failure.
    return { status: 'ignored', retryable: false, attempts: claim.attempts };
  }

  try {
    await handler(event);
    event.status = 'processed';
    event.processedAt = new Date();
    await settle(event.id, 'processed');
    return { status: 'processed', retryable: false, attempts: claim.attempts };
  } catch (err) {
    const errorMessage = (err as Error).message;
    event.status = 'failed';
    event.error = errorMessage;
    // P-36: the old line here was `markEventProcessed(event.id)`, which is why a
    // failed `invoice.paid` was lost forever. `failed` is retryable.
    await settle(event.id, 'failed', errorMessage);
    // P-42: and now the caller is told to SAY so. `retryable` is false on the
    // attempt that spends the last of the budget, so the redelivery this asks
    // for is one that will actually be given to a handler.
    return {
      status: 'failed',
      error: errorMessage,
      retryable: claim.attempts < MAX_HANDLER_ATTEMPTS,
      attempts: claim.attempts,
    };
  }
}

// --- Event History ---

/**
 * Oldest-first among the most recent `limit` rows — the order the array this
 * replaced returned from `eventHistory.slice(-limit)`.
 */
export async function getWebhookHistory(limit = 100): Promise<WebhookEvent[]> {
  const rows = await prisma.inboundWebhookEvent.findMany({
    where: { provider: PROVIDER },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.reverse().map((row) => {
    const payload = row.payload;
    const event: WebhookEvent = {
      id: row.eventId,
      type: row.type,
      data:
        payload !== null && typeof payload === 'object' && !Array.isArray(payload)
          ? { ...payload }
          : {},
      status: row.status as WebhookEvent['status'],
    };
    if (row.processedAt) event.processedAt = row.processedAt;
    if (row.error) event.error = row.error;
    return event;
  });
}

// --- Built-in Handlers ---

export async function handleInvoicePaid(event: WebhookEvent): Promise<void> {
  const { data } = event;
  const invoiceId = data.id as string | undefined;
  if (!invoiceId) {
    throw new Error('Missing invoice id in event data');
  }
  // In production, update FinancialRecord status to PAID via Prisma.
  // Placeholder: log the action.
  console.log(`[webhook] invoice.paid: Invoice ${invoiceId} marked as PAID`);
}

export async function handleInvoicePaymentFailed(event: WebhookEvent): Promise<void> {
  const { data } = event;
  const invoiceId = data.id as string | undefined;
  if (!invoiceId) {
    throw new Error('Missing invoice id in event data');
  }
  // In production, update FinancialRecord, create alert notification.
  console.log(`[webhook] invoice.payment_failed: Invoice ${invoiceId} payment failed`);
}

export async function handleSubscriptionUpdated(event: WebhookEvent): Promise<void> {
  const { data } = event;
  const subscriptionId = data.id as string | undefined;
  if (!subscriptionId) {
    throw new Error('Missing subscription id in event data');
  }
  // In production, update subscription status and plan details.
  console.log(`[webhook] customer.subscription.updated: Subscription ${subscriptionId} updated`);
}

export async function handleSubscriptionDeleted(event: WebhookEvent): Promise<void> {
  const { data } = event;
  const subscriptionId = data.id as string | undefined;
  if (!subscriptionId) {
    throw new Error('Missing subscription id in event data');
  }
  // In production, mark subscription as cancelled, trigger notifications.
  console.log(`[webhook] customer.subscription.deleted: Subscription ${subscriptionId} cancelled`);
}

export async function handleCheckoutCompleted(event: WebhookEvent): Promise<void> {
  const { data } = event;
  const sessionId = data.id as string | undefined;
  if (!sessionId) {
    throw new Error('Missing session id in event data');
  }
  // In production, provision access and create subscription record.
  console.log(`[webhook] checkout.session.completed: Session ${sessionId} completed`);
}

// --- Default Handler Registration ---

function registerDefaultHandlers(): void {
  registerHandler('invoice.paid', handleInvoicePaid);
  registerHandler('invoice.payment_failed', handleInvoicePaymentFailed);
  registerHandler('customer.subscription.updated', handleSubscriptionUpdated);
  registerHandler('customer.subscription.deleted', handleSubscriptionDeleted);
  registerHandler('checkout.session.completed', handleCheckoutCompleted);
}

// Register default handlers at module load time
registerDefaultHandlers();
