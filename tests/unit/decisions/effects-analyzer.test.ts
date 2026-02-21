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

  describe('analyzeEffects category-specific fallbacks', () => {
    it('should generate finance-specific effects for financial actions', async () => {
      const tree = await analyzeEffects('Reduce budget allocation by 20%', 'Corp finance');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      const financeAreas = ['Budget', 'Cash Flow', 'Accounting', 'Compliance', 'Investment', 'Profitability', 'Procurement'];
      const hasFinanceArea = financeAreas.some((area) => allAreas.includes(area));
      expect(hasFinanceArea).toBe(true);

      // Should reference the action in descriptions
      const descriptions = tree.effects.map((e) => e.description).join(' ');
      expect(descriptions).toContain('budget');
    });

    it('should generate finance effects for cost-related actions', async () => {
      const tree = await analyzeEffects('Increase cost of operations', 'Business');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Budget|Cash Flow|Accounting|Investment|Profitability/),
        ])
      );
    });

    it('should generate finance effects for revenue-related actions', async () => {
      const tree = await analyzeEffects('New revenue stream from subscriptions', 'SaaS');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Budget|Cash Flow|Accounting|Investment|Profitability/),
        ])
      );
    });

    it('should generate HR-specific effects for team actions', async () => {
      const tree = await analyzeEffects('Hire 5 new engineers for the team', 'Startup');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      const hrAreas = ['Team', 'Culture', 'HR', 'Training', 'Productivity', 'Capacity', 'Innovation', 'Knowledge Management', 'Retention', 'Employer Brand', 'Morale'];
      const hasHRArea = hrAreas.some((area) => allAreas.includes(area));
      expect(hasHRArea).toBe(true);
    });

    it('should generate HR effects for staffing actions', async () => {
      const tree = await analyzeEffects('Restructure staff across departments', 'Enterprise');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Team|Culture|HR|Training|Retention/),
        ])
      );
    });

    it('should generate tech-specific effects for deployment actions', async () => {
      const tree = await analyzeEffects('Deploy new microservices architecture', 'Platform team');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      const techAreas = ['Infrastructure', 'Reliability', 'Engineering', 'Sprint Planning', 'Code Quality', 'Architecture', 'User Experience', 'Performance', 'Monitoring', 'Hiring', 'Innovation', 'Velocity', 'Technical Debt'];
      const hasTechArea = techAreas.some((area) => allAreas.includes(area));
      expect(hasTechArea).toBe(true);
    });

    it('should generate tech effects for migration actions', async () => {
      const tree = await analyzeEffects('Migrate database to cloud infrastructure', 'DevOps');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Infrastructure|Reliability|Engineering|Architecture/),
        ])
      );
    });

    it('should generate tech effects for upgrade actions', async () => {
      const tree = await analyzeEffects('Upgrade the build system to latest version', 'Dev team');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Infrastructure|Engineering|Architecture|Code Quality/),
        ])
      );
    });

    it('should generate market-specific effects for launch actions', async () => {
      const tree = await analyzeEffects('Launch new product in European market', 'Sales');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      const marketAreas = ['Brand', 'Market Presence', 'Competition', 'Pricing', 'Customer Relations', 'Support', 'Revenue', 'Growth', 'Market Share', 'Pricing Strategy', 'Partnerships', 'Pricing Power', 'Marketing Budget', 'ROI'];
      const hasMarketArea = marketAreas.some((area) => allAreas.includes(area));
      expect(hasMarketArea).toBe(true);
    });

    it('should generate market effects for customer-focused actions', async () => {
      const tree = await analyzeEffects('Improve customer onboarding experience', 'Product');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Brand|Market Presence|Customer Relations|Revenue/),
        ])
      );
    });

    it('should generate market effects for competitive actions', async () => {
      const tree = await analyzeEffects('Compete aggressively on pricing', 'Strategy');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      expect(allAreas).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Competition|Pricing|Market Share/),
        ])
      );
    });

    it('should generate generic effects for unrecognized actions', async () => {
      const tree = await analyzeEffects('Expand office space', 'Real estate');

      const allAreas = tree.effects.flatMap((e) => e.affectedAreas);
      // Generic effects include Operations, Budget, Team, Reputation, etc.
      expect(allAreas).toEqual(
        expect.arrayContaining(['Operations'])
      );
    });

    it('should still have 7 effects regardless of category', async () => {
      const actions = [
        'Cut the budget significantly',
        'Hire more staff for the team',
        'Deploy the new build system',
        'Launch marketing campaign',
        'Reorganize the office',
      ];

      for (const action of actions) {
        const tree = await analyzeEffects(action, 'Context');
        expect(tree.effects).toHaveLength(7);

        const firstOrder = tree.effects.filter((e) => e.order === 1);
        const secondOrder = tree.effects.filter((e) => e.order === 2);
        const thirdOrder = tree.effects.filter((e) => e.order === 3);
        expect(firstOrder).toHaveLength(3);
        expect(secondOrder).toHaveLength(2);
        expect(thirdOrder).toHaveLength(2);
      }
    });

    it('should include category-relevant affected areas in all effects', async () => {
      // Finance action
      const finTree = await analyzeEffects('Reduce cost by 15%', 'Finance dept');
      const finAreas = new Set(finTree.effects.flatMap((e) => e.affectedAreas));
      expect(finAreas.has('Budget') || finAreas.has('Cash Flow')).toBe(true);

      // HR action
      const hrTree = await analyzeEffects('Fire underperforming employees', 'HR');
      const hrAreas = new Set(hrTree.effects.flatMap((e) => e.affectedAreas));
      expect(hrAreas.has('Team') || hrAreas.has('Culture') || hrAreas.has('HR')).toBe(true);

      // Tech action
      const techTree = await analyzeEffects('Build new CI/CD pipeline', 'DevOps');
      const techAreas = new Set(techTree.effects.flatMap((e) => e.affectedAreas));
      expect(techAreas.has('Infrastructure') || techAreas.has('Engineering')).toBe(true);

      // Market action
      const mktTree = await analyzeEffects('Launch brand awareness campaign', 'Marketing');
      const mktAreas = new Set(mktTree.effects.flatMap((e) => e.affectedAreas));
      expect(mktAreas.has('Brand') || mktAreas.has('Market Presence')).toBe(true);
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
