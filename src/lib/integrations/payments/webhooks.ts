import { createHmac, timingSafeEqual } from 'crypto';

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

// --- Internal State ---

const handlers = new Map<string, WebhookHandler>();
const processedEventIds = new Set<string>();
const eventHistory: WebhookEvent[] = [];

/** Exposed for testing: resets all handlers, processed events, and history. */
export function _resetState(): void {
  handlers.clear();
  processedEventIds.clear();
  eventHistory.length = 0;
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

export function isEventProcessed(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

export function markEventProcessed(eventId: string): void {
  processedEventIds.add(eventId);
}

// --- Event Processing ---

export async function processWebhookEvent(event: WebhookEvent): Promise<{
  status: 'processed' | 'failed' | 'ignored';
  error?: string;
}> {
  // Idempotency check
  if (isEventProcessed(event.id)) {
    return { status: 'ignored', error: 'Event already processed' };
  }

  const handler = handlers.get(event.type);
  if (!handler) {
    event.status = 'ignored';
    eventHistory.push(event);
    markEventProcessed(event.id);
    return { status: 'ignored' };
  }

  try {
    await handler(event);
    event.status = 'processed';
    event.processedAt = new Date();
    eventHistory.push(event);
    markEventProcessed(event.id);
    return { status: 'processed' };
  } catch (err) {
    const errorMessage = (err as Error).message;
    event.status = 'failed';
    event.error = errorMessage;
    eventHistory.push(event);
    markEventProcessed(event.id);
    return { status: 'failed', error: errorMessage };
  }
}

// --- Event History ---

export function getWebhookHistory(limit = 100): WebhookEvent[] {
  return eventHistory.slice(-limit);
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
