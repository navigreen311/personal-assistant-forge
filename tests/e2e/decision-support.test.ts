/**
 * E2E Test: Decision Support
 * Tests: create brief -> matrix scoring -> pre-mortem -> journal -> research
 *
 * Services under test:
 * - decision-framework.ts (createDecisionBrief, getDecisionBrief, listDecisionBriefs)
 * - decision-matrix.ts (createMatrix, validateWeights)
 * - pre-mortem.ts (runPreMortem, calculateRiskScore)
 * - decision-journal.ts (createEntry, reviewEntry, getUpcomingReviews, getDecisionAccuracy)
 * - research-agent.ts (conductResearch, evaluateSourceCredibility, analyzeDocument)
 */

// --- Infrastructure mocks ---

const mockPrisma = {
  document: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/ai', () => ({ generateJSON: jest.fn(), generateText: jest.fn() }));

import { createDecisionBrief } from '@/modules/decisions/services/decision-framework';
import { createMatrix, validateWeights } from '@/modules/decisions/services/decision-matrix';
import { runPreMortem, calculateRiskScore } from '@/modules/decisions/services/pre-mortem';
import { createEntry, reviewEntry, getUpcomingReviews, getDecisionAccuracy } from '@/modules/decisions/services/decision-journal';
import { conductResearch, evaluateSourceCredibility, analyzeDocument } from '@/modules/decisions/services/research-agent';
import { generateJSON, generateText } from '@/lib/ai';
import type { DecisionRequest, MatrixCriterion, MatrixScore, FailureScenario, PreMortemRequest, ResearchRequest } from '@/modules/decisions/types';

const mockGenerateJSON = generateJSON as jest.Mock;
const mockGenerateText = generateText as jest.Mock;

describe('Decision Support E2E', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('Decision Brief CRUD', () => {
    it('should create a decision brief with 3 AI-generated options', async () => {
      mockGenerateJSON
        .mockResolvedValueOnce({ options: [
          { label: 'Conservative', stance: 'CONSERVATIVE', description: 'Safe', pros: ['low risk'], cons: ['slow'], estimatedCost: 1000, estimatedTimeline: '6m', riskLevel: 'LOW', reversibility: 'EASY', secondOrderEffects: [] },
          { label: 'Moderate', stance: 'MODERATE', description: 'Balanced', pros: ['balanced'], cons: ['some risk'], estimatedCost: 5000, estimatedTimeline: '3m', riskLevel: 'MEDIUM', reversibility: 'MODERATE', secondOrderEffects: [] },
          { label: 'Aggressive', stance: 'AGGRESSIVE', description: 'Bold', pros: ['fast'], cons: ['high risk'], estimatedCost: 15000, estimatedTimeline: '1m', riskLevel: 'HIGH', reversibility: 'DIFFICULT', secondOrderEffects: [] },
        ] })
        .mockResolvedValueOnce({ blindSpots: ['Market conditions not analyzed'] });

      (mockPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'doc-1', title: 'European Expansion', createdAt: new Date(), updatedAt: new Date() });

      const brief = await createDecisionBrief({ entityId: 'entity-1', title: 'European Expansion', description: 'Expand?', context: 'Growing EU demand', stakeholders: ['CEO'], constraints: ['Budget: $50k'], blastRadius: 'HIGH' });
      expect(brief.options).toHaveLength(3);
      expect(brief.blindSpots.length).toBeGreaterThan(0);
    });

    it('should fall back gracefully when AI fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'doc-fb', title: 'Fallback', createdAt: new Date(), updatedAt: new Date() });
      const brief = await createDecisionBrief({ entityId: 'entity-1', title: 'Fallback', description: 'Test', context: 'C', stakeholders: [], constraints: [], blastRadius: 'LOW' });
      expect(brief.options.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Decision Matrix Creation and Scoring', () => {
    const criteria: MatrixCriterion[] = [{ id: 'c1', name: 'Cost', weight: 0.4 }, { id: 'c2', name: 'Risk', weight: 0.35 }, { id: 'c3', name: 'Impact', weight: 0.25 }];
    const scores: MatrixScore[] = [
      { criterionId: 'c1', optionId: 'optA', score: 8, rationale: 'Low cost' }, { criterionId: 'c2', optionId: 'optA', score: 7, rationale: 'Low risk' }, { criterionId: 'c3', optionId: 'optA', score: 5, rationale: 'Moderate' },
      { criterionId: 'c1', optionId: 'optB', score: 4, rationale: 'High cost' }, { criterionId: 'c2', optionId: 'optB', score: 5, rationale: 'Medium' }, { criterionId: 'c3', optionId: 'optB', score: 9, rationale: 'High impact' },
      { criterionId: 'c1', optionId: 'optC', score: 6, rationale: 'Medium cost' }, { criterionId: 'c2', optionId: 'optC', score: 6, rationale: 'Medium risk' }, { criterionId: 'c3', optionId: 'optC', score: 7, rationale: 'Good' },
    ];

    it('should validate weights summing to 1.0', () => { expect(validateWeights(criteria)).toEqual({ valid: true }); });
    it('should reject weights not summing to 1.0', () => { expect(validateWeights([{ id: 'a', name: 'A', weight: 0.5 }, { id: 'b', name: 'B', weight: 0.3 }]).valid).toBe(false); });
    it('should reject negative weights', () => { expect(validateWeights([{ id: 'a', name: 'A', weight: -0.2 }, { id: 'b', name: 'B', weight: 1.2 }]).valid).toBe(false); });
    it('should reject empty criteria', () => { expect(validateWeights([]).valid).toBe(false); });

    it('should calculate correct weighted totals', () => {
      const result = createMatrix('dec-1', criteria, scores);
      expect(result.winner).toBe('optA');
      expect(result.optionScores.find((o) => o.optionId === 'optA')!.weightedTotal).toBeCloseTo(6.9, 1);
    });

    it('should rank options descending', () => {
      const result = createMatrix('dec-1', criteria, scores);
      const totals = result.optionScores.map((o) => o.weightedTotal);
      for (let i = 0; i < totals.length - 1; i++) expect(totals[i]).toBeGreaterThanOrEqual(totals[i + 1]);
    });

    it('should calculate margin between #1 and #2', () => {
      expect(createMatrix('dec-1', criteria, scores).margin).toBeCloseTo(0.65, 1);
    });

    it('should include sensitivity analysis', () => {
      const result = createMatrix('dec-1', criteria, scores);
      expect(result.sensitivityAnalysis).toHaveLength(criteria.length);
      for (const sa of result.sensitivityAnalysis) expect(['NONE', 'MINOR', 'MAJOR']).toContain(sa.impactOnRanking);
    });
  });

  describe('Pre-Mortem Generation', () => {
    it('should generate failure scenarios via AI', async () => {
      mockGenerateJSON.mockResolvedValueOnce({ scenarios: [{ description: 'Budget overrun', probability: 'MEDIUM', impact: 'HIGH', category: 'FINANCIAL', rootCause: 'Scope creep' }, { description: 'Attrition', probability: 'LOW', impact: 'HIGH', category: 'OPERATIONAL', rootCause: 'Burnout' }, { description: 'Market shift', probability: 'MEDIUM', impact: 'MEDIUM', category: 'REPUTATIONAL', rootCause: 'Competition' }] })
        .mockResolvedValueOnce({ mitigations: [{ scenarioId: 'scenario-dec-1-1', action: 'Contingency budget', owner: 'CFO' }] })
        .mockResolvedValueOnce({ signals: ['Costs exceed 125%', 'Milestone missed 3 weeks'] });
      const result = await runPreMortem({ decisionId: 'dec-1', chosenOptionId: 'opt-1', timeHorizon: '90_DAYS' });
      expect(result.failureScenarios.length).toBeGreaterThanOrEqual(3);
    });

    it('should fall back to rule-based on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      const result = await runPreMortem({ decisionId: 'dec-1', chosenOptionId: 'opt-1', timeHorizon: '90_DAYS' });
      expect(result.failureScenarios.length).toBeGreaterThanOrEqual(3);
      expect(result.killSignals.length).toBeGreaterThanOrEqual(3);
    });

    it('should return risk score between 0 and 100', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      const result = await runPreMortem({ decisionId: 'dec-1', chosenOptionId: 'opt-1', timeHorizon: '30_DAYS' });
      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(100);
    });

    it('should return 0 risk for empty scenarios', () => { expect(calculateRiskScore([])).toBe(0); });
    it('should return 100 risk for all HIGH/HIGH', () => {
      expect(calculateRiskScore([{ id: '1', description: 'Bad', probability: 'HIGH', impact: 'HIGH', category: 'FINANCIAL', rootCause: 'x' }])).toBe(100);
    });
    it('should return low score for LOW/LOW', () => {
      expect(calculateRiskScore([{ id: '1', description: 'Minor', probability: 'LOW', impact: 'LOW', category: 'OPERATIONAL', rootCause: 'x' }])).toBeLessThan(20);
    });
  });

  describe('Decision Journal', () => {
    it('should create a journal entry', async () => {
      const now = new Date();
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'j1', title: 'My Decision', content: JSON.stringify({ entityId: 'e1', context: 'Context', optionsConsidered: ['A', 'B'], chosenOption: 'B', rationale: 'Best value', expectedOutcomes: ['Savings'], reviewDate: now.toISOString(), status: 'PENDING_REVIEW' }), createdAt: now, updatedAt: now });
      const entry = await createEntry({ entityId: 'e1', title: 'My Decision', context: 'Context', optionsConsidered: ['A', 'B'], chosenOption: 'B', rationale: 'Best value', expectedOutcomes: ['Savings'], reviewDate: now, status: 'PENDING_REVIEW' });
      expect(entry.id).toBe('j1');
      expect(entry.status).toBe('PENDING_REVIEW');
    });

    it('should review an entry with actual outcomes', async () => {
      const now = new Date();
      const content = { entityId: 'e1', context: 'C', optionsConsidered: ['A'], chosenOption: 'A', rationale: 'R', expectedOutcomes: ['G'], reviewDate: now.toISOString(), status: 'PENDING_REVIEW' };
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 'j1', title: 'D', content: JSON.stringify(content), createdAt: now, updatedAt: now });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({ id: 'j1', title: 'D', content: JSON.stringify({ ...content, actualOutcomes: ['Worked'], status: 'REVIEWED_CORRECT', lessonsLearned: 'Trust data' }), createdAt: now, updatedAt: now });
      const result = await reviewEntry('j1', ['Worked'], 'REVIEWED_CORRECT', 'Trust data');
      expect(result.status).toBe('REVIEWED_CORRECT');
    });

    it('should throw for non-existent entry', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(reviewEntry('nope', ['x'], 'REVIEWED_CORRECT', 'l')).rejects.toThrow('not found');
    });

    it('should return upcoming reviews within N days', async () => {
      const now = new Date();
      const soon = new Date(now.getTime() + 5 * 86400000);
      const later = new Date(now.getTime() + 60 * 86400000);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 'j1', title: 'Soon', content: JSON.stringify({ entityId: 'e1', reviewDate: soon.toISOString(), status: 'PENDING_REVIEW', context: '', optionsConsidered: [], chosenOption: '', rationale: '', expectedOutcomes: [] }), createdAt: now, updatedAt: now },
        { id: 'j2', title: 'Later', content: JSON.stringify({ entityId: 'e1', reviewDate: later.toISOString(), status: 'PENDING_REVIEW', context: '', optionsConsidered: [], chosenOption: '', rationale: '', expectedOutcomes: [] }), createdAt: now, updatedAt: now },
      ]);
      const results = await getUpcomingReviews('e1', 30);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('j1');
    });

    it('should calculate correct accuracy stats', async () => {
      const now = new Date();
      const mkDoc = (id: string, st: string) => ({ id, title: id, content: JSON.stringify({ entityId: 'e1', status: st, reviewDate: now.toISOString(), context: '', optionsConsidered: [], chosenOption: '', rationale: '', expectedOutcomes: [] }), createdAt: now, updatedAt: now });
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([mkDoc('j1', 'REVIEWED_CORRECT'), mkDoc('j2', 'REVIEWED_CORRECT'), mkDoc('j3', 'REVIEWED_INCORRECT'), mkDoc('j4', 'REVIEWED_MIXED'), mkDoc('j5', 'PENDING_REVIEW')]);
      const r = await getDecisionAccuracy('e1');
      expect(r.total).toBe(4);
      expect(r.accuracy).toBe(0.5);
    });
  });

  describe('Research Generation', () => {
    it('should conduct research with AI findings', async () => {
      mockGenerateJSON.mockResolvedValue({ sources: [{ type: 'WEB', title: 'AI Market', excerpt: 'Growing', url: 'https://example.com' }], findings: [{ claim: 'Growing 25% YoY', evidence: 'Reports', confidence: 0.8, sourceIndices: [0] }], gaps: ['Competitor data'] });
      mockGenerateText.mockResolvedValue('AI market growing.');
      const report = await conductResearch({ query: 'Market trends in AI', entityId: 'e1', depth: 'STANDARD', sourceTypes: ['WEB'], maxSources: 5 });
      expect(report.findings.length).toBeGreaterThan(0);
    });

    it('should fall back on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));
      const report = await conductResearch({ query: 'Market trends in AI', entityId: 'e1', depth: 'STANDARD', sourceTypes: ['WEB'], maxSources: 5 });
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.summary).toContain('Market trends in AI');
    });

    it('should have higher confidence for DEEP vs QUICK', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      const quick = await conductResearch({ query: 'test', entityId: 'e1', depth: 'QUICK', sourceTypes: ['WEB'], maxSources: 3 });
      const deep = await conductResearch({ query: 'test', entityId: 'e1', depth: 'DEEP', sourceTypes: ['WEB'], maxSources: 3 });
      expect(deep.confidenceScore).toBeGreaterThan(quick.confidenceScore);
    });

    it('should score KNOWLEDGE sources highest', () => { expect(evaluateSourceCredibility({ type: 'KNOWLEDGE' })).toBeGreaterThan(0.7); });
    it('should score DOCUMENT higher than WEB', () => { expect(evaluateSourceCredibility({ type: 'DOCUMENT' })).toBeGreaterThan(evaluateSourceCredibility({ type: 'WEB' })); });
    it('should return 0.5 for empty source', () => { expect(evaluateSourceCredibility({})).toBe(0.5); });

    it('should detect risk keywords in documents', async () => {
      const analysis = await analyzeDocument('significant risk of liability if penalty clauses triggered due to failure');
      expect(analysis.risks.length).toBeGreaterThan(0);
    });

    it('should detect obligation keywords', async () => {
      const analysis = await analyzeDocument('The client must deliver documents. The vendor shall provide support.');
      expect(analysis.obligations.length).toBeGreaterThan(0);
    });

    it('should handle empty document content', async () => {
      const analysis = await analyzeDocument('');
      expect(analysis.keyTerms).toHaveLength(0);
      expect(analysis.risks).toHaveLength(0);
    });
  });
});
