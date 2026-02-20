jest.mock('@/lib/db', () => ({
  prisma: {
    decision: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    actionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error("AI unavailable - use fallback")),
  generateText: jest.fn().mockResolvedValue("test"),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    decision: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    document: { findMany: jest.fn().mockResolvedValue([]) },
    contact: { findMany: jest.fn().mockResolvedValue([]) },
    project: { findMany: jest.fn().mockResolvedValue([]) },
    task: { findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
    workflow: { findMany: jest.fn().mockResolvedValue([]) },
    financialRecord: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable')),
  generateText: jest.fn().mockRejectedValue(new Error('AI unavailable')),
}));

import {
  analyzeEffects,
  flattenEffectsTree,
  filterByOrder,
} from '@/modules/decisions/services/effects-analyzer';
import type { EffectsTree, SecondOrderEffect } from '@/modules/decisions/types';

describe('Effects Analyzer', () => {
  describe('analyzeEffects', () => {
    it('should return a tree with effects at orders 1, 2, and 3', async () => {
      const tree = await analyzeEffects('Launch new product', 'Tech company');

      const orders = new Set(tree.effects.map((e) => e.order));
      expect(orders.has(1)).toBe(true);
      expect(orders.has(2)).toBe(true);
      expect(orders.has(3)).toBe(true);
    });

    it('should correctly count positive and negative effects', async () => {
      const tree = await analyzeEffects('Hire new team', 'Startup');

      const actualPositive = tree.effects.filter((e) => e.sentiment === 'POSITIVE').length;
      const actualNegative = tree.effects.filter((e) => e.sentiment === 'NEGATIVE').length;

      expect(tree.totalPositive).toBe(actualPositive);
      expect(tree.totalNegative).toBe(actualNegative);
    });

    it('should have net sentiment between -1 and 1', async () => {
      const tree = await analyzeEffects('Budget cut', 'Corp');

      expect(tree.netSentiment).toBeGreaterThanOrEqual(-1);
      expect(tree.netSentiment).toBeLessThanOrEqual(1);
    });

    it('should set rootAction to the provided action', async () => {
      const tree = await analyzeEffects('Expand office', 'Real estate');
      expect(tree.rootAction).toBe('Expand office');
    });

    it('should chain effects via parentEffectId', async () => {
      const tree = await analyzeEffects('Test action', 'Context');
      const childEffects = tree.effects.filter((e) => e.parentEffectId);

      for (const child of childEffects) {
        const parent = tree.effects.find((e) => e.id === child.parentEffectId);
        expect(parent).toBeDefined();
        expect(parent!.order).toBeLessThan(child.order);
      }
    });
  });

  describe('flattenEffectsTree', () => {
    it('should return effects sorted by order', () => {
      const tree: EffectsTree = {
        rootAction: 'test',
        effects: [
          { id: '3', description: 'Third', order: 3, sentiment: 'NEUTRAL', likelihood: 0.3, affectedAreas: [] },
          { id: '1', description: 'First', order: 1, sentiment: 'POSITIVE', likelihood: 0.9, affectedAreas: [] },
          { id: '2', description: 'Second', order: 2, sentiment: 'NEGATIVE', likelihood: 0.5, affectedAreas: [] },
        ],
        totalPositive: 1,
        totalNegative: 1,
        netSentiment: 0,
      };

      const flat = flattenEffectsTree(tree);
      expect(flat[0].order).toBe(1);
      expect(flat[1].order).toBe(2);
      expect(flat[2].order).toBe(3);
    });

    it('should preserve all effects', () => {
      const tree: EffectsTree = {
        rootAction: 'test',
        effects: [
          { id: '1', description: 'A', order: 1, sentiment: 'POSITIVE', likelihood: 0.8, affectedAreas: ['a'] },
          { id: '2', description: 'B', order: 2, sentiment: 'NEGATIVE', likelihood: 0.5, affectedAreas: ['b'] },
        ],
        totalPositive: 1,
        totalNegative: 1,
        netSentiment: 0,
      };

      const flat = flattenEffectsTree(tree);
      expect(flat).toHaveLength(2);
    });
  });

  describe('filterByOrder', () => {
    const effects: SecondOrderEffect[] = [
      { id: '1a', description: 'First A', order: 1, sentiment: 'POSITIVE', likelihood: 0.9, affectedAreas: [] },
      { id: '1b', description: 'First B', order: 1, sentiment: 'NEGATIVE', likelihood: 0.7, affectedAreas: [] },
      { id: '2a', description: 'Second A', order: 2, sentiment: 'NEUTRAL', likelihood: 0.5, affectedAreas: [] },
      { id: '3a', description: 'Third A', order: 3, sentiment: 'POSITIVE', likelihood: 0.3, affectedAreas: [] },
    ];

    it('should filter first-order effects', () => {
      const result = filterByOrder(effects, 1);
      expect(result).toHaveLength(2);
      result.forEach((e) => expect(e.order).toBe(1));
    });

    it('should filter second-order effects', () => {
      const result = filterByOrder(effects, 2);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2a');
    });

    it('should filter third-order effects', () => {
      const result = filterByOrder(effects, 3);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3a');
    });

    it('should return empty array for non-existent order', () => {
      const result = filterByOrder(effects, 4);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
      const result = filterByOrder([], 1);
      expect(result).toHaveLength(0);
    });
  });
});
