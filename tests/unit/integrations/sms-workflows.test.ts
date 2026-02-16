import {
  sendTemplatedSms,
  updateDeliveryStatus,
  getDeliveryHistory,
  handleOptOut,
  handleOptIn,
  isOptedOut,
  getOptOutStats,
  calculateSegments,
  _resetStores,
} from '@/lib/integrations/sms/workflows';

// Mock the SMS client
jest.mock('@/lib/integrations/sms/client', () => ({
  sendSMS: jest.fn().mockResolvedValue('SM_mock_sid_123'),
}));

import { sendSMS } from '@/lib/integrations/sms/client';
const mockSendSMS = sendSMS as jest.MockedFunction<typeof sendSMS>;

beforeEach(() => {
  _resetStores();
  mockSendSMS.mockClear();
  mockSendSMS.mockResolvedValue('SM_mock_sid_123');
});

// ─── sendTemplatedSms ──────────────────────────────────────────────────────────

describe('SMS Workflows', () => {
  describe('sendTemplatedSms', () => {
    it('should send SMS and return delivery record', async () => {
      const result = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '123456', expiresInMinutes: 10 },
        entityId: 'entity-1',
      });

      expect(result.id).toBeTruthy();
      expect(result.status).toBe('sent');
      expect(result.to).toBe('+1234567890');
      expect(result.message).toContain('123456');
      expect(result.segments).toBeGreaterThan(0);
      expect(result.sentAt).toBeInstanceOf(Date);
      expect(mockSendSMS).toHaveBeenCalledTimes(1);
    });

    it('should refuse to send to opted-out numbers', async () => {
      await handleOptOut({
        phoneNumber: '+1234567890',
        entityId: 'entity-1',
      });

      const result = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '123456', expiresInMinutes: 10 },
        entityId: 'entity-1',
      });

      expect(result.status).toBe('failed');
      expect(result.failureReason).toContain('opted out');
      expect(mockSendSMS).not.toHaveBeenCalled();
    });

    it('should calculate segment count correctly', async () => {
      const result = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '999999', expiresInMinutes: 5 },
        entityId: 'entity-1',
      });

      expect(result.segments).toBe(1); // verification code is short
    });
  });

  // ─── updateDeliveryStatus ──────────────────────────────────────────────────

  describe('updateDeliveryStatus', () => {
    it('should update status of existing delivery record', async () => {
      const record = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '123456', expiresInMinutes: 10 },
        entityId: 'entity-1',
      });

      await updateDeliveryStatus({
        messageId: record.id,
        status: 'delivered',
        timestamp: new Date(),
      });

      const history = getDeliveryHistory('+1234567890');
      expect(history[0].status).toBe('delivered');
      expect(history[0].deliveredAt).toBeInstanceOf(Date);
    });

    it('should record failure reason on failed delivery', async () => {
      const record = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '123456', expiresInMinutes: 10 },
        entityId: 'entity-1',
      });

      await updateDeliveryStatus({
        messageId: record.id,
        status: 'failed',
        timestamp: new Date(),
        failureReason: 'Number disconnected',
      });

      const history = getDeliveryHistory('+1234567890');
      expect(history[0].status).toBe('failed');
      expect(history[0].failureReason).toBe('Number disconnected');
    });
  });

  // ─── handleOptOut / handleOptIn ────────────────────────────────────────────

  describe('handleOptOut / handleOptIn', () => {
    it('should mark phone number as opted out', async () => {
      await handleOptOut({
        phoneNumber: '+1234567890',
        entityId: 'entity-1',
      });

      expect(isOptedOut('+1234567890', 'entity-1')).toBe(true);
    });

    it('should block sends after opt-out', async () => {
      await handleOptOut({
        phoneNumber: '+1234567890',
        entityId: 'entity-1',
      });

      const result = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '000000', expiresInMinutes: 5 },
        entityId: 'entity-1',
      });

      expect(result.status).toBe('failed');
      expect(mockSendSMS).not.toHaveBeenCalled();
    });

    it('should allow sends after opt-in', async () => {
      await handleOptOut({
        phoneNumber: '+1234567890',
        entityId: 'entity-1',
      });

      await handleOptIn({
        phoneNumber: '+1234567890',
        entityId: 'entity-1',
      });

      expect(isOptedOut('+1234567890', 'entity-1')).toBe(false);

      const result = await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '111111', expiresInMinutes: 5 },
        entityId: 'entity-1',
      });

      expect(result.status).toBe('sent');
      expect(mockSendSMS).toHaveBeenCalledTimes(1);
    });
  });

  // ─── isOptedOut ────────────────────────────────────────────────────────────

  describe('isOptedOut', () => {
    it('should return true for opted-out numbers', async () => {
      await handleOptOut({
        phoneNumber: '+1111111111',
        entityId: 'entity-1',
      });

      expect(isOptedOut('+1111111111', 'entity-1')).toBe(true);
    });

    it('should return false for active numbers', () => {
      expect(isOptedOut('+2222222222', 'entity-1')).toBe(false);
    });

    it('should scope opt-out to entity', async () => {
      await handleOptOut({
        phoneNumber: '+1111111111',
        entityId: 'entity-1',
      });

      expect(isOptedOut('+1111111111', 'entity-1')).toBe(true);
      expect(isOptedOut('+1111111111', 'entity-2')).toBe(false);
    });
  });

  // ─── getDeliveryHistory ────────────────────────────────────────────────────

  describe('getDeliveryHistory', () => {
    it('should return delivery records for a phone number', async () => {
      await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '111111', expiresInMinutes: 10 },
        entityId: 'entity-1',
      });
      await sendTemplatedSms({
        to: '+1234567890',
        templateId: 'verification-code',
        data: { code: '222222', expiresInMinutes: 5 },
        entityId: 'entity-1',
      });

      const history = getDeliveryHistory('+1234567890');
      expect(history.length).toBe(2);
      expect(history.every((r) => r.to === '+1234567890')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await sendTemplatedSms({
          to: '+1234567890',
          templateId: 'verification-code',
          data: { code: String(i).padStart(6, '0'), expiresInMinutes: 10 },
          entityId: 'entity-1',
        });
      }

      const history = getDeliveryHistory('+1234567890', 3);
      expect(history.length).toBe(3);
    });

    it('should return empty array for unknown number', () => {
      const history = getDeliveryHistory('+9999999999');
      expect(history).toEqual([]);
    });
  });

  // ─── getOptOutStats ────────────────────────────────────────────────────────

  describe('getOptOutStats', () => {
    it('should return correct opt-out statistics', async () => {
      await handleOptOut({ phoneNumber: '+1111111111', entityId: 'entity-1' });
      await handleOptOut({ phoneNumber: '+2222222222', entityId: 'entity-1' });
      await handleOptOut({ phoneNumber: '+3333333333', entityId: 'entity-2' }); // different entity

      const stats = getOptOutStats('entity-1');

      expect(stats.totalOptOuts).toBe(2);
      expect(stats.optedOutNumbers).toContain('+1111111111');
      expect(stats.optedOutNumbers).toContain('+2222222222');
      expect(stats.optedOutNumbers).not.toContain('+3333333333');
    });
  });
});
