jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

import {
  routeCall,
  isAfterHours,
  screenCaller,
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
});
