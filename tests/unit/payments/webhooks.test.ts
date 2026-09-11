import { FakeTable } from '../../fakes/prisma-table';

// P-36 (ESC-1): the idempotency guard was `new Set<string>()` and is now the
// `InboundWebhookEvent` table. A fake TABLE rather than `jest.fn()` stubs,
// because these cases already round-trip -- process an event, then process it
// again and expect `ignored` -- and that round trip is the thing worth keeping.
//
// The fake reproduces the unique constraint, so `claimEvent` takes its P2002
// branch here exactly as it does against Postgres. It reproduces nothing about
// PERSISTENCE: a Map in a mock factory is the very thing this package removed.
// Persistence, and a genuine duplicate INSERT rejected by a real index, are in
// tests/db/migration-window-01.test.ts.
jest.mock('@/lib/db', () => ({
  prisma: { inboundWebhookEvent: makeInboundWebhookEventTable() },
}));

function makeInboundWebhookEventTable() {
  return new FakeTable({
    uniques: { provider_eventId: ['provider', 'eventId'] },
    defaults: () => ({ status: 'received', attempts: 0, error: null, processedAt: null }),
  });
}

import { createHmac } from 'crypto';
import {
  verifyWebhookSignature,
  processWebhookEvent,
  registerHandler,
  isEventProcessed,
  handleInvoicePaid,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleCheckoutCompleted,
  _resetState,
  MAX_HANDLER_ATTEMPTS,
} from '@/lib/integrations/payments/webhooks';
import type { WebhookEvent } from '@/lib/integrations/payments/webhooks';

describe('Stripe Webhooks', () => {
  beforeEach(async () => {
    await _resetState();
  });

  // Helper to create a valid Stripe signature
  function createSignature(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }

  describe('verifyWebhookSignature', () => {
    const secret = 'whsec_test_secret';

    it('should return valid: true for correct signature', () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
      const signature = createSignature(payload, secret);

      const result = verifyWebhookSignature({ payload, signature, secret });
      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event!.id).toBe('evt_1');
    });

    it('should return valid: false for incorrect signature', () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
      const signature = createSignature(payload, 'wrong_secret');

      const result = verifyWebhookSignature({ payload, signature, secret });
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return valid: false for missing signature', () => {
      const payload = JSON.stringify({ id: 'evt_1' });
      const result = verifyWebhookSignature({ payload, signature: '', secret });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing signature');
    });
  });

  describe('processWebhookEvent', () => {
    it('should route event to registered handler', async () => {
      const handlerFn = jest.fn().mockResolvedValue(undefined);
      registerHandler('payment_intent.succeeded', handlerFn);

      const event: WebhookEvent = {
        id: 'evt_route_1',
        type: 'payment_intent.succeeded',
        data: { id: 'pi_123' },
        status: 'received',
      };

      const result = await processWebhookEvent(event);
      expect(result.status).toBe('processed');
      expect(handlerFn).toHaveBeenCalledWith(event);
    });

    it('should return ignored for unknown event types', async () => {
      const event: WebhookEvent = {
        id: 'evt_unknown_1',
        type: 'unknown.event.type',
        data: {},
        status: 'received',
      };

      const result = await processWebhookEvent(event);
      expect(result.status).toBe('ignored');
    });

    it('should skip already-processed events (idempotency)', async () => {
      const event: WebhookEvent = {
        id: 'evt_dup_1',
        type: 'invoice.paid',
        data: { id: 'inv_1' },
        status: 'received',
      };

      // Process once
      await processWebhookEvent(event);
      expect(await isEventProcessed('evt_dup_1')).toBe(true);

      // Process again
      const result = await processWebhookEvent({ ...event, status: 'received' });
      expect(result.status).toBe('ignored');
      expect(result.error).toContain('already processed');
    });

    it('should return failed status when handler throws', async () => {
      registerHandler('payment_intent.payment_failed', async () => {
        throw new Error('Handler crashed');
      });

      const event: WebhookEvent = {
        id: 'evt_fail_1',
        type: 'payment_intent.payment_failed',
        data: { id: 'pi_fail' },
        status: 'received',
      };

      const result = await processWebhookEvent(event);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Handler crashed');
    });

    // P-36: this is the defect P-33 found and left for the schema window.
    //
    // The old code called `markEventProcessed(event.id)` on the FAILURE branch,
    // and the route returns 200 unconditionally so Stripe stops retrying. A
    // handler failure on `invoice.paid` was therefore dropped permanently, and
    // Stripe's retry -- the one mechanism that could have recovered it -- was
    // answered `ignored`. There was no third state to record, because a Set is
    // a boolean. `status` is that third state.
    it('does not mark a FAILED event as processed, and lets a retry run it', async () => {
      let attempts = 0;
      registerHandler('invoice.paid', async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('downstream unavailable');
      });

      const event: WebhookEvent = {
        id: 'evt_retry_after_failure',
        type: 'invoice.paid',
        data: { id: 'inv_retry' },
        status: 'received',
      };

      expect((await processWebhookEvent(event)).status).toBe('failed');
      // The critical assertion: a failure is NOT terminal.
      expect(await isEventProcessed('evt_retry_after_failure')).toBe(false);

      const retry = await processWebhookEvent({ ...event, status: 'received' });
      expect(retry.status).toBe('processed');
      expect(attempts).toBe(2);
      expect(await isEventProcessed('evt_retry_after_failure')).toBe(true);
    });

    // -----------------------------------------------------------------------
    // P-42 — `retryable`, which is what the route turns into a status code.
    //
    // These cases are about the ANSWER TO STRIPE, so they are written as
    // assertions on `retryable` and on how many times the handler ran. The
    // status code itself is asserted where it is actually produced, against
    // the real route and a real database, in tests/db/stripe-webhook-status.
    // -----------------------------------------------------------------------
    it('does not ask for a retry when the handler succeeded', async () => {
      registerHandler('payment_intent.succeeded', async () => undefined);

      const result = await processWebhookEvent({
        id: 'evt_ok_not_retryable',
        type: 'payment_intent.succeeded',
        data: { id: 'pi_ok' },
        status: 'received',
      });

      expect(result).toMatchObject({ status: 'processed', retryable: false, attempts: 1 });
    });

    it('does not ask for a retry for an event type it has no handler for', async () => {
      const result = await processWebhookEvent({
        id: 'evt_unknown_not_retryable',
        type: 'unknown.event.type',
        data: {},
        status: 'received',
      });

      // Redelivery cannot register a handler. Not implementing an event type is
      // a decision, and a decision must not look like a transient failure.
      expect(result).toMatchObject({ status: 'ignored', retryable: false });
    });

    it('does not ask for a retry of a DUPLICATE — the work already happened', async () => {
      registerHandler('invoice.paid', async () => undefined);
      const event: WebhookEvent = {
        id: 'evt_dup_not_retryable',
        type: 'invoice.paid',
        data: { id: 'inv_dup' },
        status: 'received',
      };

      expect((await processWebhookEvent(event)).retryable).toBe(false);

      const duplicate = await processWebhookEvent({ ...event, status: 'received' });
      expect(duplicate).toMatchObject({ status: 'ignored', retryable: false });
      expect(duplicate.error).toContain('already processed');
    });

    it('ASKS for a retry while the budget lasts, and stops asking once it is spent', async () => {
      // The poison event. Under the fix's first half alone -- non-200 on every
      // failure -- this event would be redelivered for three days and run a
      // handler known to fail on every one of them.
      let runs = 0;
      registerHandler('invoice.paid', async () => {
        runs += 1;
        throw new Error('ledger permanently unavailable');
      });

      const event: WebhookEvent = {
        id: 'evt_poison',
        type: 'invoice.paid',
        data: { id: 'inv_poison' },
        status: 'received',
      };

      const seen: Array<{ attempts: number; retryable: boolean }> = [];
      for (let delivery = 1; delivery <= MAX_HANDLER_ATTEMPTS; delivery += 1) {
        const result = await processWebhookEvent({ ...event, status: 'received' });
        expect(result.status).toBe('failed');
        seen.push({ attempts: result.attempts, retryable: result.retryable });
      }

      expect(seen).toEqual([
        { attempts: 1, retryable: true },
        { attempts: 2, retryable: true },
        { attempts: 3, retryable: true },
        { attempts: 4, retryable: true },
        // The attempt that spends the last of the budget already knows nobody
        // will act on a redelivery, so it does not ask for one.
        { attempts: 5, retryable: false },
      ]);
      expect(runs).toBe(MAX_HANDLER_ATTEMPTS);

      // A sixth delivery does not reach the handler at all.
      const beyond = await processWebhookEvent({ ...event, status: 'received' });
      expect(beyond).toMatchObject({ status: 'failed', retryable: false, attempts: 5 });
      expect(beyond.error).toContain('no further retries');
      expect(runs).toBe(MAX_HANDLER_ATTEMPTS);

      // And it is still NOT reported as handled. `failed` is the state an
      // operator queries for; "exhausted" must never decay into "processed".
      expect(await isEventProcessed('evt_poison')).toBe(false);
    });

    it('a handler that recovers within the budget still succeeds', async () => {
      // The counterpart the budget must not break: five attempts exist so a
      // transient outage can end on its own.
      let runs = 0;
      registerHandler('invoice.paid', async () => {
        runs += 1;
        if (runs < 3) throw new Error('ledger briefly unavailable');
      });

      const event: WebhookEvent = {
        id: 'evt_recovers',
        type: 'invoice.paid',
        data: { id: 'inv_recovers' },
        status: 'received',
      };

      expect((await processWebhookEvent({ ...event, status: 'received' })).retryable).toBe(true);
      expect((await processWebhookEvent({ ...event, status: 'received' })).retryable).toBe(true);
      const third = await processWebhookEvent({ ...event, status: 'received' });
      expect(third).toMatchObject({ status: 'processed', attempts: 3 });
      expect(await isEventProcessed('evt_recovers')).toBe(true);
    });

    it('still refuses a second delivery of an event that SUCCEEDED', async () => {
      const handlerFn = jest.fn().mockResolvedValue(undefined);
      registerHandler('payment_intent.succeeded', handlerFn);

      const event: WebhookEvent = {
        id: 'evt_once_only',
        type: 'payment_intent.succeeded',
        data: { id: 'pi_once' },
        status: 'received',
      };

      expect((await processWebhookEvent(event)).status).toBe('processed');
      expect((await processWebhookEvent({ ...event, status: 'received' })).status).toBe('ignored');
      expect(handlerFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleInvoicePaid', () => {
    it('should update financial record status', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event: WebhookEvent = {
        id: 'evt_inv_paid',
        type: 'invoice.paid',
        data: { id: 'inv_123' },
        status: 'received',
      };

      await handleInvoicePaid(event);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('inv_123')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleSubscriptionUpdated', () => {
    it('should update subscription details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event: WebhookEvent = {
        id: 'evt_sub_upd',
        type: 'customer.subscription.updated',
        data: { id: 'sub_456' },
        status: 'received',
      };

      await handleSubscriptionUpdated(event);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('sub_456')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('should mark subscription as cancelled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event: WebhookEvent = {
        id: 'evt_sub_del',
        type: 'customer.subscription.deleted',
        data: { id: 'sub_789' },
        status: 'received',
      };

      await handleSubscriptionDeleted(event);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('sub_789')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleCheckoutCompleted', () => {
    it('should create new subscription', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event: WebhookEvent = {
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: { id: 'cs_001' },
        status: 'received',
      };

      await handleCheckoutCompleted(event);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('cs_001')
      );
      consoleSpy.mockRestore();
    });
  });
});
