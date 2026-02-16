import { generateDrafts, scanCompliance, adaptToAudience, analyzePowerDynamics } from '@/modules/communication/services/drafting-engine';
import type { Contact, ComplianceProfile } from '@/shared/types';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    entity: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('drafting-engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDrafts', () => {
    it('should return 2-3 draft variants', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'contact-1',
        name: 'John Doe',
        preferences: { preferredTone: 'DIRECT', preferredChannel: 'EMAIL' },
        tags: [],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });

      const result = await generateDrafts({
        recipientId: 'contact-1',
        entityId: 'entity-1',
        channel: 'EMAIL',
        intent: 'Schedule a meeting to discuss Q1 results',
        tone: 'DIPLOMATIC',
      });

      expect(result.variants.length).toBeGreaterThanOrEqual(2);
      expect(result.variants.length).toBeLessThanOrEqual(3);
    });

    it('should include recipient profile in response', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'contact-1',
        name: 'Jane Smith',
        preferences: { preferredTone: 'WARM', preferredChannel: 'SLACK' },
        tags: [],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });

      const result = await generateDrafts({
        recipientId: 'contact-1',
        entityId: 'entity-1',
        channel: 'EMAIL',
        intent: 'Follow up on proposal',
        tone: 'DIRECT',
      });

      expect(result.recipientProfile).toBeDefined();
      expect(result.recipientProfile.preferredTone).toBe('WARM');
      expect(result.recipientProfile.preferredChannel).toBe('SLACK');
    });

    it('should each variant have valid fields', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'contact-1',
        name: 'Test',
        preferences: {},
        tags: [],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });

      const result = await generateDrafts({
        recipientId: 'contact-1',
        entityId: 'entity-1',
        channel: 'EMAIL',
        intent: 'Discuss budget',
        tone: 'FIRM',
      });

      for (const variant of result.variants) {
        expect(variant.id).toBeDefined();
        expect(variant.label).toBeDefined();
        expect(variant.body.length).toBeGreaterThan(0);
        expect(variant.tone).toBeDefined();
        expect(variant.wordCount).toBeGreaterThan(0);
        expect(variant.readingLevel).toBeDefined();
        expect(Array.isArray(variant.complianceFlags)).toBe(true);
      }
    });

    it('should throw when contact not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        generateDrafts({
          recipientId: 'nonexistent',
          entityId: 'entity-1',
          channel: 'EMAIL',
          intent: 'Test',
          tone: 'DIRECT',
        })
      ).rejects.toThrow('Contact not found');
    });

    it('should include power dynamic note', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'contact-1',
        name: 'Client VIP',
        preferences: {},
        tags: ['client'],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });

      const result = await generateDrafts({
        recipientId: 'contact-1',
        entityId: 'entity-1',
        channel: 'EMAIL',
        intent: 'Invoice follow-up',
        tone: 'DIRECT',
      });

      expect(result.powerDynamicNote).toBeDefined();
      expect(result.powerDynamicNote!.toLowerCase()).toContain('client');
    });
  });

  describe('scanCompliance', () => {
    it('should detect SSN patterns as PII', () => {
      const result = scanCompliance('Send to SSN 123-45-6789 please.', []);
      expect(result.passed).toBe(false);
      expect(result.flags.some((f) => f.rule === 'PII_SSN')).toBe(true);
    });

    it('should detect threat language', () => {
      const result = scanCompliance('We will take legal action and sue.', []);
      expect(result.flags.some((f) => f.rule === 'THREAT_LANGUAGE')).toBe(true);
    });

    it('should detect promise/guarantee language', () => {
      const result = scanCompliance('We guarantee delivery by Friday.', []);
      expect(result.flags.some((f) => f.rule === 'PROMISE_GUARANTEE')).toBe(true);
    });

    it('should detect HIPAA regulated terms', () => {
      const result = scanCompliance('Review the patient diagnosis and prescription.', ['HIPAA']);
      expect(result.flags.some((f) => f.rule === 'REGULATED_TERMS' || f.rule === 'HIPAA_PHI')).toBe(true);
    });

    it('should detect confidential markers', () => {
      const result = scanCompliance('This is confidential and proprietary information.', []);
      expect(result.flags.some((f) => f.rule === 'CONFIDENTIAL_MARKERS')).toBe(true);
    });

    it('should pass for clean text', () => {
      const result = scanCompliance('Hello, I would like to schedule a meeting next week.', []);
      expect(result.passed).toBe(true);
      // May still have warning-level flags (like email patterns) but no errors
      expect(result.flags.filter((f) => f.severity === 'ERROR')).toHaveLength(0);
    });

    it('should detect credit card numbers', () => {
      const result = scanCompliance('Pay with card 4111-1111-1111-1111.', []);
      expect(result.flags.some((f) => f.rule === 'FINANCIAL_PII')).toBe(true);
    });
  });

  describe('adaptToAudience', () => {
    it('should adapt draft to contact preferred tone', () => {
      const contact: Contact = {
        id: 'c-1',
        entityId: 'e-1',
        name: 'Test',
        channels: [],
        relationshipScore: 50,
        lastTouch: null,
        commitments: [],
        preferences: { preferredChannel: 'EMAIL', preferredTone: 'WARM', doNotContact: false },
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = adaptToAudience('Please complete the task.', contact);
      expect(result).toContain('hope this finds you well');
    });
  });

  describe('analyzePowerDynamics', () => {
    it('should detect CLIENT dynamic from tags', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        tags: ['client', 'VIP'],
      });

      const result = await analyzePowerDynamics('entity-1', 'c-1');
      expect(result.dynamic).toBe('CLIENT');
    });

    it('should detect VENDOR dynamic from tags', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        tags: ['vendor'],
      });

      const result = await analyzePowerDynamics('entity-1', 'c-1');
      expect(result.dynamic).toBe('VENDOR');
    });

    it('should default to PEER when no tags match', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        tags: ['friend'],
      });

      const result = await analyzePowerDynamics('entity-1', 'c-1');
      expect(result.dynamic).toBe('PEER');
    });

    it('should return PEER when contact not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await analyzePowerDynamics('entity-1', 'nonexistent');
      expect(result.dynamic).toBe('PEER');
    });
  });
});
