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

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import {
  createDecisionBrief,
  getDecisionBrief,
  listDecisionBriefs,
} from '@/modules/decisions/services/decision-framework';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('Decision Framework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDecisionBrief with AI', () => {
    it('should call generateJSON to produce 3 options', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        options: [
          { label: 'Conservative', stance: 'CONSERVATIVE', description: 'Safe approach', pros: ['low risk'], cons: ['slow'], estimatedCost: 1000, estimatedTimeline: '6 months', riskLevel: 'LOW', reversibility: 'EASY', secondOrderEffects: [] },
          { label: 'Moderate', stance: 'MODERATE', description: 'Balanced', pros: ['balanced'], cons: ['some risk'], estimatedCost: 5000, estimatedTimeline: '3 months', riskLevel: 'MEDIUM', reversibility: 'MODERATE', secondOrderEffects: [] },
          { label: 'Aggressive', stance: 'AGGRESSIVE', description: 'Bold move', pros: ['fast'], cons: ['high risk'], estimatedCost: 15000, estimatedTimeline: '1 month', riskLevel: 'HIGH', reversibility: 'DIFFICULT', secondOrderEffects: [] },
        ],
      }).mockResolvedValueOnce({
        blindSpots: ['Market conditions not analyzed', 'Team capacity unknown'],
      });

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
      expect(mockGenerateJSON).toHaveBeenCalled();
    });

    it('should include decision context in AI prompt', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        options: [
          { label: 'A', stance: 'CONSERVATIVE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 100, estimatedTimeline: '1m', riskLevel: 'LOW', reversibility: 'EASY', secondOrderEffects: [] },
          { label: 'B', stance: 'MODERATE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 500, estimatedTimeline: '2m', riskLevel: 'MEDIUM', reversibility: 'MODERATE', secondOrderEffects: [] },
          { label: 'C', stance: 'AGGRESSIVE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 1500, estimatedTimeline: '3m', riskLevel: 'HIGH', reversibility: 'DIFFICULT', secondOrderEffects: [] },
        ],
      }).mockResolvedValueOnce({
        blindSpots: ['Blind spot 1'],
      });

      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await createDecisionBrief({
        entityId: 'entity-1',
        title: 'Expand to Europe',
        description: 'European expansion plan',
        context: 'Growing demand from EU customers',
        stakeholders: ['CEO'],
        constraints: ['Budget: $50k'],
        blastRadius: 'HIGH',
      });

      const prompt = mockGenerateJSON.mock.calls[0][0] as string;
      expect(prompt).toContain('Expand to Europe');
      expect(prompt).toContain('European expansion plan');
    });

    it('should fall back to rule-based generation on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));

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
      // Should still produce 3 options via fallback
      expect(brief.options).toHaveLength(3);
      const strategies = brief.options.map((o) => o.strategy);
      expect(strategies).toContain('CONSERVATIVE');
      expect(strategies).toContain('MODERATE');
      expect(strategies).toContain('AGGRESSIVE');
    });

    it('should store AI-generated brief in database', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        options: [
          { label: 'A', stance: 'CONSERVATIVE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 100, estimatedTimeline: '1m', riskLevel: 'LOW', reversibility: 'EASY', secondOrderEffects: [] },
          { label: 'B', stance: 'MODERATE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 500, estimatedTimeline: '2m', riskLevel: 'MEDIUM', reversibility: 'MODERATE', secondOrderEffects: [] },
          { label: 'C', stance: 'AGGRESSIVE', description: 'd', pros: ['p'], cons: ['c'], estimatedCost: 1500, estimatedTimeline: '3m', riskLevel: 'HIGH', reversibility: 'DIFFICULT', secondOrderEffects: [] },
        ],
      }).mockResolvedValueOnce({
        blindSpots: ['Blind spot'],
      });

      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await createDecisionBrief({
        entityId: 'entity-1',
        title: 'Test',
        description: 'D',
        context: 'C',
        stakeholders: [],
        constraints: [],
        blastRadius: 'LOW',
      });

      expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
      const createCall = (mockPrisma.document.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.type).toBe('BRIEF');
      expect(createCall.data.entityId).toBe('entity-1');
    });

    it('should have confidence score between 0 and 1', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

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

    it('should identify blind spots', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

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
