import type { DecisionRequest } from '@/modules/decisions/types';

// Mock prisma before importing the service
jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  createDecisionBrief,
  getDecisionBrief,
  listDecisionBriefs,
} from '@/modules/decisions/services/decision-framework';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Decision Framework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDecisionBrief', () => {
    it('should generate exactly 3 options', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test Decision',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request: DecisionRequest = {
        entityId: 'entity-1',
        title: 'Test Decision',
        description: 'Should we do this?',
        context: 'We are evaluating options for the next quarter.',
        stakeholders: ['contact-1'],
        constraints: ['Budget: $10k'],
        blastRadius: 'MEDIUM',
      };

      const brief = await createDecisionBrief(request);
      expect(brief.options).toHaveLength(3);
    });

    it('should include conservative, moderate, and aggressive strategies', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request: DecisionRequest = {
        entityId: 'entity-1',
        title: 'Test',
        description: 'Desc',
        context: 'Context',
        stakeholders: [],
        constraints: [],
        blastRadius: 'LOW',
      };

      const brief = await createDecisionBrief(request);
      const strategies = brief.options.map((o) => o.strategy);
      expect(strategies).toContain('CONSERVATIVE');
      expect(strategies).toContain('MODERATE');
      expect(strategies).toContain('AGGRESSIVE');
    });

    it('should have confidence score between 0 and 1', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request: DecisionRequest = {
        entityId: 'entity-1',
        title: 'Test',
        description: 'Desc',
        context: 'A long context with enough detail to boost confidence score above baseline.',
        stakeholders: ['s1'],
        constraints: ['c1'],
        blastRadius: 'CRITICAL',
      };

      const brief = await createDecisionBrief(request);
      expect(brief.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(brief.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('should have each option with required fields', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request: DecisionRequest = {
        entityId: 'entity-1',
        title: 'Test',
        description: 'D',
        context: 'C',
        stakeholders: [],
        constraints: [],
        blastRadius: 'LOW',
      };

      const brief = await createDecisionBrief(request);
      for (const opt of brief.options) {
        expect(opt.id).toBeTruthy();
        expect(opt.label).toBeTruthy();
        expect(opt.description).toBeTruthy();
        expect(opt.pros.length).toBeGreaterThan(0);
        expect(opt.cons.length).toBeGreaterThan(0);
        expect(typeof opt.estimatedCost).toBe('number');
        expect(opt.estimatedTimeline).toBeTruthy();
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(opt.riskLevel);
        expect(['EASY', 'MODERATE', 'DIFFICULT', 'IRREVERSIBLE']).toContain(opt.reversibility);
      }
    });

    it('should identify blind spots', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request: DecisionRequest = {
        entityId: 'entity-1',
        title: 'Test',
        description: 'D',
        context: 'C',
        stakeholders: [],
        constraints: [],
        blastRadius: 'LOW',
      };

      const brief = await createDecisionBrief(request);
      expect(brief.blindSpots.length).toBeGreaterThan(0);
    });
  });

  describe('getDecisionBrief', () => {
    it('should return null for non-existent brief', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getDecisionBrief('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for non-BRIEF document type', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        type: 'MEMO',
        content: '{}',
        title: 'Test',
        createdAt: new Date(),
      });

      const result = await getDecisionBrief('doc-1');
      expect(result).toBeNull();
    });

    it('should parse stored brief correctly', async () => {
      const storedContent = {
        title: 'Test',
        options: [
          { id: 'o1', label: 'A', strategy: 'CONSERVATIVE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 100, estimatedTimeline: '1m', riskLevel: 'LOW', reversibility: 'EASY', secondOrderEffects: [] },
        ],
        recommendation: 'Go with A',
        confidenceScore: 0.7,
        blindSpots: ['None found'],
      };

      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        type: 'BRIEF',
        content: JSON.stringify(storedContent),
        title: 'Test',
        createdAt: new Date(),
      });

      const result = await getDecisionBrief('doc-1');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test');
      expect(result!.confidenceScore).toBe(0.7);
    });
  });

  describe('listDecisionBriefs', () => {
    it('should return briefs with pagination', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 'doc-1', title: 'Brief 1', content: '{"options":[],"recommendation":"","confidenceScore":0.5,"blindSpots":[]}', createdAt: new Date() },
        { id: 'doc-2', title: 'Brief 2', content: '{"options":[],"recommendation":"","confidenceScore":0.6,"blindSpots":[]}', createdAt: new Date() },
      ]);
      (mockPrisma.document.count as jest.Mock).mockResolvedValue(2);

      const result = await listDecisionBriefs('entity-1', 1, 10);
      expect(result.briefs).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });
});
