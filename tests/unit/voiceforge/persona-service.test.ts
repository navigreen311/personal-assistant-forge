// Mock AI client — must be before imports
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
  generateText: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

import {
  createPersona,
  getPersona,
  listPersonas,
  updatePersona,
  addConsentEntry,
  revokeConsent,
  validateConsentChain,
  generateWatermarkId,
} from '@/modules/voiceforge/services/persona-service';

jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const basePersonaData = {
  entityId: 'entity-1',
  name: 'Sales Agent',
  description: 'Professional sales voice',
  voiceConfig: {
    provider: 'mock',
    voiceId: 'voice-1',
    speed: 1.0,
    pitch: 1.0,
    language: 'en-US',
  },
  personality: {
    defaultTone: 'WARM',
    formality: 7,
    empathy: 8,
    assertiveness: 5,
    humor: 3,
    vocabulary: 'MODERATE' as const,
  },
  status: 'DRAFT' as const,
  consentChain: [],
};

describe('Persona Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPersona', () => {
    it('should create a persona document', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'persona-1',
        entityId: 'entity-1',
        content: JSON.stringify(basePersonaData),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createPersona(basePersonaData);
      expect(result.id).toBe('persona-1');
      expect(result.name).toBe('Sales Agent');
      expect(mockPrisma.document.create).toHaveBeenCalled();
    });
  });

  describe('getPersona', () => {
    it('should return persona when found', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'persona-1',
        entityId: 'entity-1',
        content: JSON.stringify(basePersonaData),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getPersona('persona-1');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Sales Agent');
    });

    it('should return null when not found', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await getPersona('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listPersonas', () => {
    it('should return all personas for entity', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p1',
          entityId: 'entity-1',
          content: JSON.stringify({ ...basePersonaData, name: 'Agent 1' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p2',
          entityId: 'entity-1',
          content: JSON.stringify({ ...basePersonaData, name: 'Agent 2' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await listPersonas('entity-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('validateConsentChain', () => {
    it('should be valid when all entries are GRANTED', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'persona-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...basePersonaData,
          consentChain: [
            { id: 'c1', grantedBy: 'user-1', grantedAt: new Date(), scope: 'voice', status: 'GRANTED' },
            { id: 'c2', grantedBy: 'user-2', grantedAt: new Date(), scope: 'recording', status: 'GRANTED' },
          ],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await validateConsentChain('persona-1');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should be invalid when any entry is REVOKED', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'persona-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...basePersonaData,
          consentChain: [
            { id: 'c1', grantedBy: 'user-1', grantedAt: new Date(), scope: 'voice', status: 'GRANTED' },
            { id: 'c2', grantedBy: 'user-2', grantedAt: new Date(), scope: 'recording', status: 'REVOKED', revokedAt: new Date() },
          ],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await validateConsentChain('persona-1');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('revoked'))).toBe(true);
    });

    it('should be invalid when any entry is EXPIRED', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'persona-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...basePersonaData,
          consentChain: [
            { id: 'c1', grantedBy: 'user-1', grantedAt: new Date(), scope: 'voice', status: 'EXPIRED' },
          ],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await validateConsentChain('persona-1');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('expired'))).toBe(true);
    });

    it('should be invalid when consent chain is empty', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'persona-1',
        entityId: 'entity-1',
        content: JSON.stringify({ ...basePersonaData, consentChain: [] }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await validateConsentChain('persona-1');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('No consent entries'))).toBe(true);
    });

    it('should return invalid for non-existent persona', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await validateConsentChain('nonexistent');
      expect(result.valid).toBe(false);
    });
  });

  describe('generateWatermarkId', () => {
    it('should generate a unique watermark starting with WM-', () => {
      const wm1 = generateWatermarkId();
      const wm2 = generateWatermarkId();
      expect(wm1).toMatch(/^WM-/);
      expect(wm2).toMatch(/^WM-/);
      expect(wm1).not.toBe(wm2);
    });
  });
});
