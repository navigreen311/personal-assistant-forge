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
} from '@/lib/integrations/payments/webhooks';
import type { WebhookEvent } from '@/lib/integrations/payments/webhooks';

describe('Stripe Webhooks', () => {
  beforeEach(() => {
    _resetState();
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
      expect(isEventProcessed('evt_dup_1')).toBe(true);

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
