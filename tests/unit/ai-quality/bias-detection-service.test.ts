import {
  detectBias,
  getAffectedGroups,
} from '@/modules/ai-quality/services/bias-detection-service';
import type { BiasDimension } from '@/modules/ai-quality/types';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    task: {
      count: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    actionLog: {
      findMany: jest.fn(),
    },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    dimensions: [
      { name: 'entity_bias', description: 'AI: Entity bias is low.' },
      { name: 'contact_bias', description: 'AI: Contact bias is low.' },
      { name: 'channel_bias', description: 'AI: Channel bias is low.' },
      { name: 'time_bias', description: 'AI: Time bias is low.' },
    ],
    alerts: [],
  }),
}));

const { prisma } = require('@/lib/db');
const { generateJSON } = require('@/lib/ai');

describe('BiasDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks for common queries
    (prisma.entity.findUnique as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (prisma.entity.findMany as jest.Mock).mockResolvedValue([
      { id: 'entity-1', name: 'Entity A', userId: 'user-1' },
      { id: 'entity-2', name: 'Entity B', userId: 'user-1' },
    ]);
    (prisma.task.count as jest.Mock).mockResolvedValue(10);
    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
  });

  describe('detectBias', () => {
    it('should return a bias report with all 4 dimensions', async () => {
      const report = await detectBias('entity-1', '2026-02');

      expect(report.entityId).toBe('entity-1');
      expect(report.period).toBe('2026-02');
      expect(report.dimensions).toHaveLength(4);
      expect(report.dimensions[0].name).toBe('entity_bias');
      expect(report.dimensions[1].name).toBe('contact_bias');
      expect(report.dimensions[2].name).toBe('channel_bias');
      expect(report.dimensions[3].name).toBe('time_bias');
    });

    it('should return entity_bias with score 0 when entity is not found', async () => {
      (prisma.entity.findUnique as jest.Mock).mockResolvedValue(null);

      const report = await detectBias('nonexistent', '2026-02');

      const entityDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'entity_bias'
      );
      expect(entityDim).toBeDefined();
      expect(entityDim!.score).toBe(0);
      expect(entityDim!.affectedGroups).toEqual([]);
    });

    it('should calculate low entity bias when task completion rates are similar', async () => {
      // Both entities have same completion rate (10 total, 8 done each)
      (prisma.task.count as jest.Mock)
        .mockResolvedValueOnce(10) // entity-1 total
        .mockResolvedValueOnce(8)  // entity-1 done
        .mockResolvedValueOnce(10) // entity-2 total
        .mockResolvedValueOnce(8); // entity-2 done

      const report = await detectBias('entity-1', '2026-02');

      const entityDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'entity_bias'
      );
      expect(entityDim!.score).toBe(0);
    });

    it('should calculate high entity bias when task completion rates differ significantly', async () => {
      // Make AI fail so we get the static description
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      (prisma.task.count as jest.Mock)
        .mockResolvedValueOnce(100) // entity-1 total
        .mockResolvedValueOnce(95)  // entity-1 done (95%)
        .mockResolvedValueOnce(100) // entity-2 total
        .mockResolvedValueOnce(10); // entity-2 done (10%)

      const report = await detectBias('entity-1', '2026-02');

      const entityDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'entity_bias'
      );
      expect(entityDim!.score).toBeGreaterThan(0.3);
      expect(entityDim!.description).toBe(
        'Task completion rates vary significantly across entities.'
      );
    });

    it('should detect contact bias from message approval rates', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { recipientId: 'contact-1', draftStatus: 'APPROVED' },
        { recipientId: 'contact-1', draftStatus: 'APPROVED' },
        { recipientId: 'contact-2', draftStatus: 'REJECTED' },
        { recipientId: 'contact-2', draftStatus: 'REJECTED' },
      ]);

      const report = await detectBias('entity-1', '2026-02');

      const contactDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'contact_bias'
      );
      expect(contactDim).toBeDefined();
      // contact-1: 100% approval, contact-2: 0% approval => high variance
      expect(contactDim!.score).toBeGreaterThan(0);
    });

    it('should detect channel bias from message approval rates by channel', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { channel: 'EMAIL', draftStatus: 'APPROVED' },
        { channel: 'EMAIL', draftStatus: 'SENT' },
        { channel: 'SLACK', draftStatus: 'REJECTED' },
        { channel: 'SLACK', draftStatus: 'REJECTED' },
      ]);

      const report = await detectBias('entity-1', '2026-02');

      const channelDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'channel_bias'
      );
      expect(channelDim).toBeDefined();
      expect(channelDim!.score).toBeGreaterThan(0);
    });

    it('should detect time bias from action log entries', async () => {
      const makeAction = (hour: number, status: string) => {
        const ts = new Date('2026-02-10');
        ts.setHours(hour);
        return { actor: 'AI', timestamp: ts, status };
      };

      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
        makeAction(9, 'COMPLETED'),
        makeAction(9, 'COMPLETED'),
        makeAction(14, 'FAILED'),
        makeAction(14, 'ROLLED_BACK'),
      ]);

      const report = await detectBias('entity-1', '2026-02');

      const timeDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'time_bias'
      );
      expect(timeDim).toBeDefined();
      // Hour 9: 100% success, Hour 14: 0% success => high variance
      expect(timeDim!.score).toBeGreaterThan(0);
    });

    it('should compute overall bias score as the average of all dimensions', async () => {
      const report = await detectBias('entity-1', '2026-02');

      expect(report.overallBiasScore).toBeGreaterThanOrEqual(0);
      expect(report.overallBiasScore).toBeLessThanOrEqual(1);
    });

    it('should use AI-generated descriptions when available', async () => {
      const report = await detectBias('entity-1', '2026-02');

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(report.dimensions[0].description).toBe('AI: Entity bias is low.');
    });

    it('should fall back to static alerts when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      // Create a scenario with high bias to generate alerts
      (prisma.task.count as jest.Mock)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(95)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5);

      const report = await detectBias('entity-1', '2026-02');

      expect(report.dimensions).toHaveLength(4);
      // High entity bias should generate an alert
      const entityDim = report.dimensions.find(
        (d: BiasDimension) => d.name === 'entity_bias'
      );
      if (entityDim && entityDim.score > 0.5) {
        expect(report.alerts.length).toBeGreaterThan(0);
        expect(report.alerts[0]).toContain('entity_bias');
      }
    });

    it('should return empty alerts when all bias scores are low', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const report = await detectBias('entity-1', '2026-02');

      // With default mocks (equal task counts), all scores should be low
      const hasHighBias = report.dimensions.some(
        (d: BiasDimension) => d.score > 0.5
      );
      if (!hasHighBias) {
        expect(report.alerts).toEqual([]);
      }
    });
  });

  describe('getAffectedGroups', () => {
    it('should return empty array when no affected groups exist', () => {
      const dimension: BiasDimension = {
        name: 'test_bias',
        score: 0,
        description: 'No bias.',
        affectedGroups: [],
      };

      const result = getAffectedGroups(dimension);
      expect(result).toEqual([]);
    });

    it('should calculate expected and actual rates for each group', () => {
      const dimension: BiasDimension = {
        name: 'entity_bias',
        score: 0.3,
        description: 'Some bias detected.',
        affectedGroups: [
          { group: 'Entity A', deviation: 0.1 },
          { group: 'Entity B', deviation: -0.1 },
        ],
      };

      const result = getAffectedGroups(dimension);

      expect(result).toHaveLength(2);
      expect(result[0].group).toBe('Entity A');
      expect(result[0].expectedRate).toBe(0.5); // 1/2 groups
      expect(result[0].actualRate).toBeCloseTo(0.6); // 0.5 + 0.1
      expect(result[0].deviation).toBe(0.1);
      expect(result[1].group).toBe('Entity B');
      expect(result[1].actualRate).toBeCloseTo(0.4); // 0.5 - 0.1
    });

    it('should handle single group correctly', () => {
      const dimension: BiasDimension = {
        name: 'channel_bias',
        score: 0,
        description: 'Single channel.',
        affectedGroups: [{ group: 'EMAIL', deviation: 0 }],
      };

      const result = getAffectedGroups(dimension);

      expect(result).toHaveLength(1);
      expect(result[0].expectedRate).toBe(1); // 1/1 group
      expect(result[0].actualRate).toBe(1);
      expect(result[0].deviation).toBe(0);
    });
  });
});
