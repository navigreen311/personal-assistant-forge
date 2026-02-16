import {
  scheduleEmail,
  cancelScheduledEmail,
  processScheduledEmails,
  sendBatchEmails,
  handleBounce,
  isEmailSuppressed,
  handleUnsubscribe,
  isUnsubscribed,
  getDeliverabilityStats,
  _resetStores,
} from '@/lib/integrations/email/workflows';

// Mock the email client
jest.mock('@/lib/integrations/email/client', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

import { sendEmail } from '@/lib/integrations/email/client';
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

beforeEach(() => {
  _resetStores();
  mockSendEmail.mockClear();
  mockSendEmail.mockResolvedValue(true);
});

// ─── scheduleEmail ─────────────────────────────────────────────────────────────

describe('Email Workflows', () => {
  describe('scheduleEmail', () => {
    it('should create a scheduled email with pending status', async () => {
      const result = await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: { userName: 'Test', entityName: 'Corp', loginUrl: 'https://example.com' },
        scheduledAt: new Date('2030-01-01'),
      });

      expect(result.id).toBeTruthy();
      expect(result.status).toBe('pending');
      expect(result.templateId).toBe('welcome');
      expect(result.to).toBe('user@example.com');
      expect(result.attempts).toBe(0);
    });

    it('should set default maxAttempts', async () => {
      const result = await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: {},
        scheduledAt: new Date('2030-01-01'),
      });

      expect(result.maxAttempts).toBe(3);
    });
  });

  // ─── cancelScheduledEmail ──────────────────────────────────────────────────

  describe('cancelScheduledEmail', () => {
    it('should cancel a pending scheduled email', async () => {
      const scheduled = await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: {},
        scheduledAt: new Date('2030-01-01'),
      });

      const cancelled = await cancelScheduledEmail(scheduled.id);
      expect(cancelled).toBe(true);
    });

    it('should return false for non-existent email', async () => {
      const result = await cancelScheduledEmail('nonexistent-id');
      expect(result).toBe(false);
    });

    it('should return false for already-sent email', async () => {
      // Schedule in the past so processScheduledEmails sends it
      const scheduled = await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: { userName: 'Test', entityName: 'Corp', loginUrl: 'https://example.com' },
        scheduledAt: new Date('2020-01-01'),
      });

      await processScheduledEmails();

      const result = await cancelScheduledEmail(scheduled.id);
      expect(result).toBe(false);
    });
  });

  // ─── processScheduledEmails ────────────────────────────────────────────────

  describe('processScheduledEmails', () => {
    it('should send emails that are due', async () => {
      await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: { userName: 'Test', entityName: 'Corp', loginUrl: 'https://example.com' },
        scheduledAt: new Date('2020-01-01'), // past date
      });

      const result = await processScheduledEmails();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('should not send emails scheduled for the future', async () => {
      await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: {},
        scheduledAt: new Date('2099-01-01'), // far future
      });

      const result = await processScheduledEmails();

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should track failed attempts', async () => {
      mockSendEmail.mockResolvedValue(false);

      const scheduled = await scheduleEmail({
        templateId: 'welcome',
        to: 'user@example.com',
        data: { userName: 'Test', entityName: 'Corp', loginUrl: 'https://example.com' },
        scheduledAt: new Date('2020-01-01'),
      });

      const result = await processScheduledEmails();

      expect(result.failed).toBe(1);
    });
  });

  // ─── sendBatchEmails ───────────────────────────────────────────────────────

  describe('sendBatchEmails', () => {
    it('should send to all recipients', async () => {
      const result = await sendBatchEmails({
        templateId: 'welcome',
        recipients: [
          { email: 'a@example.com', data: { userName: 'A', entityName: 'Corp', loginUrl: 'https://example.com' } },
          { email: 'b@example.com', data: { userName: 'B', entityName: 'Corp', loginUrl: 'https://example.com' } },
        ],
        rateLimit: 100, // fast for testing
      });

      expect(result.sentCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.status).toBe('completed');
    });

    it('should track sent and failed counts', async () => {
      let callCount = 0;
      mockSendEmail.mockImplementation(async () => {
        callCount++;
        return callCount !== 2; // fail on second call
      });

      const result = await sendBatchEmails({
        templateId: 'welcome',
        recipients: [
          { email: 'a@example.com', data: { userName: 'A', entityName: 'Corp', loginUrl: 'https://example.com' } },
          { email: 'b@example.com', data: { userName: 'B', entityName: 'Corp', loginUrl: 'https://example.com' } },
          { email: 'c@example.com', data: { userName: 'C', entityName: 'Corp', loginUrl: 'https://example.com' } },
        ],
        rateLimit: 100,
      });

      expect(result.sentCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.status).toBe('partial_failure');
    });

    it('should skip suppressed email addresses', async () => {
      // Suppress an email via hard bounce
      await handleBounce({
        email: 'bounced@example.com',
        type: 'hard',
        reason: 'Mailbox not found',
      });

      const result = await sendBatchEmails({
        templateId: 'welcome',
        recipients: [
          { email: 'good@example.com', data: { userName: 'Good', entityName: 'Corp', loginUrl: 'https://example.com' } },
          { email: 'bounced@example.com', data: { userName: 'Bad', entityName: 'Corp', loginUrl: 'https://example.com' } },
        ],
        rateLimit: 100,
      });

      expect(result.sentCount).toBe(1);
      expect(result.failedCount).toBe(1); // bounced address counts as failed
    });
  });

  // ─── handleBounce ──────────────────────────────────────────────────────────

  describe('handleBounce', () => {
    it('should record hard bounce and suppress email', async () => {
      await handleBounce({
        email: 'hard@example.com',
        type: 'hard',
        reason: 'User not found',
      });

      expect(isEmailSuppressed('hard@example.com')).toBe(true);
    });

    it('should record soft bounce without suppressing', async () => {
      await handleBounce({
        email: 'soft@example.com',
        type: 'soft',
        reason: 'Mailbox full',
      });

      expect(isEmailSuppressed('soft@example.com')).toBe(false);
    });
  });

  // ─── isEmailSuppressed ────────────────────────────────────────────────────

  describe('isEmailSuppressed', () => {
    it('should return true for hard-bounced emails', async () => {
      await handleBounce({ email: 'test@example.com', type: 'hard', reason: 'Not found' });
      expect(isEmailSuppressed('test@example.com')).toBe(true);
    });

    it('should return false for non-bounced emails', () => {
      expect(isEmailSuppressed('clean@example.com')).toBe(false);
    });
  });

  // ─── handleUnsubscribe / isUnsubscribed ────────────────────────────────────

  describe('handleUnsubscribe / isUnsubscribed', () => {
    it('should record unsubscribe for entity', async () => {
      await handleUnsubscribe({
        email: 'user@example.com',
        entityId: 'entity-1',
      });

      expect(isUnsubscribed('user@example.com', 'entity-1')).toBe(true);
    });

    it('should check unsubscribe status correctly', async () => {
      await handleUnsubscribe({
        email: 'user@example.com',
        entityId: 'entity-1',
      });

      // Different entity should not be affected
      expect(isUnsubscribed('user@example.com', 'entity-2')).toBe(false);
      // Different email should not be affected
      expect(isUnsubscribed('other@example.com', 'entity-1')).toBe(false);
    });

    it('should handle category-specific unsubscribes', async () => {
      await handleUnsubscribe({
        email: 'user@example.com',
        entityId: 'entity-1',
        categories: ['marketing'],
      });

      expect(isUnsubscribed('user@example.com', 'entity-1', 'marketing')).toBe(true);
      expect(isUnsubscribed('user@example.com', 'entity-1', 'transactional')).toBe(false);
    });
  });

  // ─── getDeliverabilityStats ────────────────────────────────────────────────

  describe('getDeliverabilityStats', () => {
    it('should return correct statistics', async () => {
      await handleBounce({ email: 'a@example.com', type: 'hard', reason: 'Not found' });
      await handleBounce({ email: 'b@example.com', type: 'soft', reason: 'Full' });
      await handleUnsubscribe({ email: 'c@example.com', entityId: 'entity-1' });

      const stats = getDeliverabilityStats('entity-1');

      expect(stats.totalBounces).toBe(2);
      expect(stats.hardBounces).toBe(1);
      expect(stats.softBounces).toBe(1);
      expect(stats.unsubscribes).toBe(1);
      expect(stats.suppressedAddresses).toContain('a@example.com');
    });
  });
});
