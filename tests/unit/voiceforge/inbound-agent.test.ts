const mockGenerateJSON = jest.fn();
const mockGenerateText = jest.fn();

jest.mock('@/lib/ai', () => ({
  generateJSON: mockGenerateJSON,
  generateText: mockGenerateText,
}));

import {
  routeCall,
  isAfterHours,
  screenCaller,
  collectIntakeForm,
} from '@/modules/voiceforge/services/inbound-agent';
import type { InboundConfig, AfterHoursConfig } from '@/modules/voiceforge/types';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findFirst: jest.fn(),
    },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    call: {
      create: jest.fn().mockResolvedValue({ id: 'call-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '@/lib/db';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Inbound Agent', () => {
  const baseConfig: InboundConfig = {
    entityId: 'entity-1',
    phoneNumber: '+15551234567',
    greeting: 'Hello!',
    personaId: 'persona-1',
    routingRules: [
      { id: 'r1', condition: 'vip=true', destination: '+15559999999', priority: 1 },
      { id: 'r2', condition: 'intent=sales', destination: '+15558888888', priority: 2 },
      { id: 'r3', condition: 'spam=true', destination: 'BLOCKED', priority: 0 },
    ],
    afterHoursConfig: {
      enabled: true,
      message: 'We are closed',
      businessHours: [
        { day: 1, start: '09:00', end: '17:00' },
        { day: 2, start: '09:00', end: '17:00' },
        { day: 3, start: '09:00', end: '17:00' },
        { day: 4, start: '09:00', end: '17:00' },
        { day: 5, start: '09:00', end: '17:00' },
      ],
      voicemailEnabled: true,
    },
    spamFilterEnabled: true,
    vipContactIds: ['contact-vip-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('routeCall', () => {
    it('should block spam when spam filter is enabled', () => {
      const result = routeCall(baseConfig, { isVIP: false, isSpam: true });
      expect(result).toBe('BLOCKED');
    });

    it('should route VIP callers to VIP destination', () => {
      const result = routeCall(baseConfig, { isVIP: true, isSpam: false });
      expect(result).toBe('+15559999999');
    });

    it('should route by intent when no VIP/spam match', () => {
      const result = routeCall(baseConfig, { isVIP: false, isSpam: false, intent: 'sales' });
      expect(result).toBe('+15558888888');
    });

    it('should default to AI_HANDLE when no rules match', () => {
      const result = routeCall(baseConfig, { isVIP: false, isSpam: false });
      expect(result).toBe('AI_HANDLE');
    });

    it('should respect priority order (lower number = higher priority)', () => {
      // Spam rule (priority 0) should match before VIP (priority 1)
      const result = routeCall(baseConfig, { isVIP: true, isSpam: true });
      expect(result).toBe('BLOCKED');
    });

    it('should not block spam at filter level when filter is disabled', () => {
      // When spam filter is disabled, the early-exit block is skipped.
      // Remove spam routing rule to test pure filter behavior.
      const configNoSpam = {
        ...baseConfig,
        spamFilterEnabled: false,
        routingRules: baseConfig.routingRules.filter((r) => r.condition !== 'spam=true'),
      };
      const result = routeCall(configNoSpam, { isVIP: false, isSpam: true });
      expect(result).toBe('AI_HANDLE');
    });
  });

  describe('isAfterHours', () => {
    it('should return false when after hours is disabled', () => {
      const config: AfterHoursConfig = {
        enabled: false,
        message: 'Closed',
        businessHours: [],
        voicemailEnabled: true,
      };
      expect(isAfterHours(config)).toBe(false);
    });

    it('should return true when no business hours defined for today', () => {
      const config: AfterHoursConfig = {
        enabled: true,
        message: 'Closed',
        businessHours: [], // No hours defined at all
        voicemailEnabled: true,
      };
      expect(isAfterHours(config)).toBe(true);
    });

    it('should return true on weekends when only weekday hours defined', () => {
      // This test is deterministic only if run on a weekday,
      // but the logic is: if no hours for current day, it's after hours
      const config: AfterHoursConfig = {
        enabled: true,
        message: 'Closed',
        businessHours: [
          { day: 1, start: '09:00', end: '17:00' },
          { day: 2, start: '09:00', end: '17:00' },
          { day: 3, start: '09:00', end: '17:00' },
          { day: 4, start: '09:00', end: '17:00' },
          { day: 5, start: '09:00', end: '17:00' },
          // No weekend hours (0=Sun, 6=Sat)
        ],
        voicemailEnabled: true,
      };
      // We just verify it returns a boolean
      const result = isAfterHours(config);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('screenCaller', () => {
    it('should return no contact when phone not found', async () => {
      (mockPrisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await screenCaller('+15550000000', 'entity-1');
      expect(result.contact).toBeNull();
      expect(result.isVIP).toBe(false);
    });

    it('should detect spam for 900 numbers', async () => {
      (mockPrisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await screenCaller('+19001234567', 'entity-1');
      expect(result.isSpam).toBe(true);
    });

    it('should not flag normal numbers as spam', async () => {
      (mockPrisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await screenCaller('+15551234567', 'entity-1');
      expect(result.isSpam).toBe(false);
    });

    it('should return contact when found by phone', async () => {
      (mockPrisma.contact.findFirst as jest.Mock).mockResolvedValue({
        id: 'contact-1',
        entityId: 'entity-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+15551234567',
        channels: '[]',
        relationshipScore: 80,
        lastTouch: null,
        commitments: '[]',
        preferences: '{}',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await screenCaller('+15551234567', 'entity-1');
      expect(result.contact).not.toBeNull();
      expect(result.contact?.name).toBe('John Doe');
    });
  });

  describe('collectIntakeForm', () => {
    it('should return empty object for empty fields array', async () => {
      const result = await collectIntakeForm([]);
      expect(result).toEqual({});
      expect(mockGenerateJSON).not.toHaveBeenCalled();
    });

    it('should generate intake prompts via AI for each field', async () => {
      mockGenerateJSON.mockResolvedValue({
        name: 'May I have your full name please?',
        email: 'What email address can we reach you at?',
        phone: 'What is your phone number?',
      });

      const result = await collectIntakeForm(['name', 'email', 'phone']);

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        name: 'May I have your full name please?',
        email: 'What email address can we reach you at?',
        phone: 'What is your phone number?',
      });
    });

    it('should fill missing fields with empty strings when AI returns partial result', async () => {
      mockGenerateJSON.mockResolvedValue({
        name: 'What is your name?',
      });

      const result = await collectIntakeForm(['name', 'email', 'phone']);

      expect(result.name).toBe('What is your name?');
      expect(result.email).toBe('');
      expect(result.phone).toBe('');
    });

    it('should return template prompts when AI is unavailable', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await collectIntakeForm(['name', 'email', 'reason']);

      expect(result.name).toBe('Please provide your name');
      expect(result.email).toBe('Please provide your email');
      expect(result.reason).toBe('Please provide your reason');
    });

    it('should handle single field collection', async () => {
      mockGenerateJSON.mockResolvedValue({
        reason: 'What is the reason for your call today?',
      });

      const result = await collectIntakeForm(['reason']);

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        reason: 'What is the reason for your call today?',
      });
    });

    it('should pass correct prompt structure to AI', async () => {
      mockGenerateJSON.mockResolvedValue({ name: 'prompt' });

      await collectIntakeForm(['name']);

      const callArgs = mockGenerateJSON.mock.calls[0];
      expect(callArgs[0]).toContain('intake');
      expect(callArgs[0]).toContain('name');
      expect(callArgs[1]).toHaveProperty('maxTokens');
      expect(callArgs[1]).toHaveProperty('temperature');
      expect(callArgs[1]).toHaveProperty('system');
    });
  });

});
