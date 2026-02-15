import {
  calculateRelationshipScore,
  getRelationshipGraph,
  detectGhosting,
  suggestReengagement,
} from '@/modules/communication/services/relationship-intelligence';

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    call: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('relationship-intelligence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRelationshipScore', () => {
    it('should return high score for frequent, recent interactions with positive sentiment', async () => {
      const now = new Date();
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: now,
        commitments: [
          { status: 'FULFILLED' },
          { status: 'FULFILLED' },
        ],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(
        Array(50).fill({ createdAt: now })
      );
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([
        { sentiment: 0.8 },
        { sentiment: 0.9 },
      ]);

      const score = await calculateRelationshipScore('c-1');
      expect(score).toBeGreaterThanOrEqual(70);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return low score for no interactions and negative sentiment', async () => {
      const old = new Date('2024-01-01');
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-2',
        lastTouch: old,
        commitments: [
          { status: 'BROKEN' },
        ],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([
        { sentiment: -0.8 },
      ]);

      const score = await calculateRelationshipScore('c-2');
      expect(score).toBeLessThanOrEqual(30);
    });

    it('should return moderate score for average engagement', async () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-3',
        lastTouch: twoWeeksAgo,
        commitments: [
          { status: 'FULFILLED' },
          { status: 'OPEN' },
        ],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(
        Array(10).fill({ createdAt: twoWeeksAgo })
      );
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([
        { sentiment: 0.2 },
      ]);

      const score = await calculateRelationshipScore('c-3');
      expect(score).toBeGreaterThanOrEqual(20);
      expect(score).toBeLessThanOrEqual(70);
    });

    it('should throw for nonexistent contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(calculateRelationshipScore('nonexistent')).rejects.toThrow('Contact not found');
    });

    it('should use at least 3 signals', async () => {
      // This test verifies the score changes when different signals change
      const now = new Date();

      // High frequency, low recency
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-a',
        lastTouch: new Date('2024-01-01'),
        commitments: [],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(Array(50).fill({ createdAt: now }));
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([]);
      const scoreA = await calculateRelationshipScore('c-a');

      // Low frequency, high recency
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-b',
        lastTouch: now,
        commitments: [],
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([]);
      const scoreB = await calculateRelationshipScore('c-b');

      // Both should be moderate but different
      expect(scoreA).not.toBe(scoreB);
    });
  });

  describe('detectGhosting', () => {
    it('should detect ghosting when silent beyond 2x average cadence', async () => {
      const now = new Date();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: sixtyDaysAgo,
      });

      // Messages were every 7 days, sorted ascending (oldest first)
      const messages = [];
      for (let i = 9; i >= 0; i--) {
        messages.push({ createdAt: new Date(sixtyDaysAgo.getTime() - i * 7 * 24 * 60 * 60 * 1000) });
      }
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages);

      const result = await detectGhosting('c-1');
      expect(result.isGhosting).toBe(true);
      expect(result.riskLevel).toBe('HIGH');
      expect(result.daysSinceLastContact).toBeGreaterThan(14);
    });

    it('should not flag ghosting when within normal cadence', async () => {
      // lastTouch is very recent (1 hour ago), messages have 7-day cadence ascending
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-2',
        lastTouch: oneHourAgo,
      });

      const messages = [];
      for (let i = 9; i >= 0; i--) {
        messages.push({ createdAt: new Date(oneHourAgo.getTime() - i * 7 * 24 * 60 * 60 * 1000) });
      }
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages);

      const result = await detectGhosting('c-2');
      expect(result.isGhosting).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should return MEDIUM risk for borderline cases', async () => {
      const now = new Date();
      // Average cadence ~14 days, last contact ~20 days ago (between 1x and 2x average)
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-3',
        lastTouch: twentyDaysAgo,
      });

      // Messages must be in ascending order (oldest first) to match orderBy: asc
      const messages = [];
      for (let i = 4; i >= 0; i--) {
        messages.push({ createdAt: new Date(twentyDaysAgo.getTime() - i * 14 * 24 * 60 * 60 * 1000) });
      }
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages);

      const result = await detectGhosting('c-3');
      expect(result.riskLevel).toBe('MEDIUM');
    });

    it('should throw for nonexistent contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(detectGhosting('nonexistent')).rejects.toThrow('Contact not found');
    });
  });

  describe('getRelationshipGraph', () => {
    it('should return nodes for all entity contacts', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', name: 'Alice', relationshipScore: 80, lastTouch: new Date(), tags: [], messages: [{}, {}], calls: [{}] },
        { id: 'c-2', name: 'Bob', relationshipScore: 30, lastTouch: null, tags: [], messages: [], calls: [] },
      ]);

      const graph = await getRelationshipGraph('entity-1');
      expect(graph).toHaveLength(2);
      expect(graph[0].connectionStrength).toBe('STRONG');
      expect(graph[1].connectionStrength).toBe('WEAK');
    });
  });

  describe('suggestReengagement', () => {
    it('should suggest value-first approach for high-risk contacts', async () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        name: 'John',
        preferences: { preferredChannel: 'EMAIL', preferredTone: 'WARM' },
        lastTouch: sixtyDaysAgo,
      });
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([
        { createdAt: new Date(sixtyDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000) },
        { createdAt: sixtyDaysAgo },
      ]);

      const strategy = await suggestReengagement('c-1');
      expect(strategy.approach.toLowerCase()).toContain('value');
      expect(strategy.suggestedMessage).toContain('John');
      expect(strategy.bestChannel).toBe('EMAIL');
    });

    it('should throw for nonexistent contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(suggestReengagement('nonexistent')).rejects.toThrow('Contact not found');
    });
  });
});
