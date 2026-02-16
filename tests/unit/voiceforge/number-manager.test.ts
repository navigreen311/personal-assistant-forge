import {
  provisionNumber,
  releaseNumber,
  listNumbers,
  assignPersona,
} from '@/modules/voiceforge/services/number-manager';

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

jest.mock('@/lib/voice/mock-provider', () => ({
  MockVoiceProvider: jest.fn().mockImplementation(() => ({
    name: 'mock',
    provisionNumber: jest.fn().mockResolvedValue({
      phoneNumber: '+15125551234',
      sid: 'PN-test-123',
      region: 'US-512',
      capabilities: ['VOICE', 'SMS'],
      monthlyRate: 1.5,
      provisionedAt: new Date(),
    }),
    releaseNumber: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { prisma } from '@/lib/db';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Number Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('provisionNumber', () => {
    it('should provision a number and store it', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'num-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          phoneNumber: '+15125551234',
          label: 'Main Line',
          provider: 'mock',
          capabilities: ['VOICE', 'SMS'],
          status: 'ACTIVE',
          monthlyRate: 1.5,
          provisionedAt: new Date().toISOString(),
        }),
        createdAt: new Date(),
      });

      const result = await provisionNumber('entity-1', '512', 'Main Line');
      expect(result.id).toBe('num-1');
      expect(result.phoneNumber).toBe('+15125551234');
      expect(result.label).toBe('Main Line');
      expect(result.status).toBe('ACTIVE');
      expect(mockPrisma.document.create).toHaveBeenCalled();
    });
  });

  describe('releaseNumber', () => {
    it('should release a number and update status', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'num-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          phoneNumber: '+15125551234',
          label: 'Main Line',
          provider: 'mock',
          capabilities: ['VOICE'],
          status: 'ACTIVE',
          monthlyRate: 1.5,
        }),
        createdAt: new Date(),
      });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});

      await releaseNumber('num-1');
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'num-1' },
          data: expect.objectContaining({
            status: 'ARCHIVED',
          }),
        })
      );
    });

    it('should throw for non-existent number', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(releaseNumber('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('listNumbers', () => {
    it('should return numbers for entity', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'num-1',
          entityId: 'entity-1',
          content: JSON.stringify({
            phoneNumber: '+15125551234',
            label: 'Main',
            provider: 'mock',
            capabilities: ['VOICE'],
            status: 'ACTIVE',
            monthlyRate: 1.5,
          }),
          createdAt: new Date(),
        },
        {
          id: 'num-2',
          entityId: 'entity-1',
          content: JSON.stringify({
            phoneNumber: '+15125559999',
            label: 'Sales',
            provider: 'mock',
            capabilities: ['VOICE', 'SMS'],
            status: 'ACTIVE',
            monthlyRate: 1.5,
          }),
          createdAt: new Date(),
        },
      ]);

      const result = await listNumbers('entity-1');
      expect(result).toHaveLength(2);
      expect(result[0].phoneNumber).toBe('+15125551234');
    });
  });

  describe('assignPersona', () => {
    it('should assign a persona to a number', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'num-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          phoneNumber: '+15125551234',
          label: 'Main',
          provider: 'mock',
          capabilities: ['VOICE'],
          status: 'ACTIVE',
          monthlyRate: 1.5,
        }),
        createdAt: new Date(),
      });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});

      const result = await assignPersona('num-1', 'persona-1');
      expect(result.assignedPersonaId).toBe('persona-1');
    });

    it('should throw for non-existent number', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(assignPersona('nonexistent', 'persona-1')).rejects.toThrow('not found');
    });
  });
});
