// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { generateJSON } from '@/lib/ai';
import {
  runPreMortem,
  calculateRiskScore,
} from '@/modules/decisions/services/pre-mortem';
import type { FailureScenario, PreMortemRequest } from '@/modules/decisions/types';

const mockGenerateJSON = generateJSON as jest.Mock;

describe('Pre-Mortem Analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runPreMortem with AI', () => {
    it('should call generateJSON for failure scenarios', async () => {
      mockGenerateJSON
        .mockResolvedValueOnce({
          scenarios: [
            { description: 'Budget overrun', probability: 'MEDIUM', impact: 'HIGH', category: 'FINANCIAL', rootCause: 'Scope creep' },
            { description: 'Team attrition', probability: 'LOW', impact: 'HIGH', category: 'OPERATIONAL', rootCause: 'Burnout' },
            { description: 'Market shift', probability: 'MEDIUM', impact: 'MEDIUM', category: 'REPUTATIONAL', rootCause: 'Competitor action' },
          ],
        })
        .mockResolvedValueOnce({
          mitigations: [
            { scenarioId: 'scenario-dec-1-1', action: 'Set up contingency budget', owner: 'CFO' },
            { scenarioId: 'scenario-dec-1-2', action: 'Cross-train team', owner: 'VP Engineering' },
            { scenarioId: 'scenario-dec-1-3', action: 'Establish monitoring', owner: 'Product Lead' },
          ],
        })
        .mockResolvedValueOnce({
          signals: ['Costs exceed 125% of budget', 'Key milestone missed by 3 weeks', 'Team satisfaction below 60%'],
        });

      const request: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '90_DAYS',
      };

      const result = await runPreMortem(request);
      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.failureScenarios.length).toBeGreaterThanOrEqual(3);
    });

    it('should call generateJSON for mitigations', async () => {
      mockGenerateJSON
        .mockResolvedValueOnce({
          scenarios: [
            { description: 'Failure', probability: 'MEDIUM', impact: 'HIGH', category: 'FINANCIAL', rootCause: 'Bad planning' },
          ],
        })
        .mockResolvedValueOnce({
          mitigations: [
            { scenarioId: 'scenario-dec-1-1', action: 'Review budget weekly', owner: 'Finance team' },
          ],
        })
        .mockResolvedValueOnce({
          signals: ['Cost overrun signal'],
        });

      const result = await runPreMortem({
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '30_DAYS',
      });

      expect(result.mitigationPlan.length).toBeGreaterThanOrEqual(1);
      expect(result.mitigationPlan[0].action).toBeTruthy();
    });

    it('should preserve risk score calculation', async () => {
      mockGenerateJSON
        .mockResolvedValueOnce({
          scenarios: [
            { description: 'High risk', probability: 'HIGH', impact: 'HIGH', category: 'FINANCIAL', rootCause: 'x' },
          ],
        })
        .mockResolvedValueOnce({ mitigations: [{ scenarioId: 'scenario-dec-1-1', action: 'Act', owner: 'TBD' }] })
        .mockResolvedValueOnce({ signals: ['Signal'] });

      const result = await runPreMortem({
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '30_DAYS',
      });

      expect(result.overallRiskScore).toBe(100);
    });

    it('should fall back to rule-based scenarios on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));

      const request: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '90_DAYS',
      };

      const result = await runPreMortem(request);
      expect(result.failureScenarios.length).toBeGreaterThanOrEqual(3);
      expect(result.mitigationPlan.length).toBeGreaterThanOrEqual(1);
      expect(result.killSignals.length).toBeGreaterThanOrEqual(3);
    });

    it('should produce kill signals', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

      const result = await runPreMortem({
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '1_YEAR',
      });

      expect(result.killSignals.length).toBeGreaterThanOrEqual(3);
    });

    it('should return risk score between 0 and 100', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

      const result = await runPreMortem({
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '30_DAYS',
      });

      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(100);
    });

    it('should have valid categories for all scenarios', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

      const result = await runPreMortem({
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '90_DAYS',
      });

      const validCategories = ['FINANCIAL', 'OPERATIONAL', 'REPUTATIONAL', 'LEGAL', 'TECHNICAL'];
      for (const s of result.failureScenarios) {
        expect(validCategories).toContain(s.category);
      }
    });
  });

  describe('calculateRiskScore', () => {
    it('should return 0 for empty scenarios', () => {
      expect(calculateRiskScore([])).toBe(0);
    });

    it('should return high score for all HIGH probability and HIGH impact', () => {
      const scenarios: FailureScenario[] = [
        { id: '1', description: 'Bad', probability: 'HIGH', impact: 'HIGH', category: 'FINANCIAL', rootCause: 'x' },
        { id: '2', description: 'Worse', probability: 'HIGH', impact: 'HIGH', category: 'TECHNICAL', rootCause: 'y' },
      ];
      const score = calculateRiskScore(scenarios);
      expect(score).toBe(100);
    });

    it('should return low score for all LOW probability and LOW impact', () => {
      const scenarios: FailureScenario[] = [
        { id: '1', description: 'Minor', probability: 'LOW', impact: 'LOW', category: 'OPERATIONAL', rootCause: 'x' },
      ];
      const score = calculateRiskScore(scenarios);
      expect(score).toBeLessThan(20);
    });

    it('should return moderate score for mixed levels', () => {
      const scenarios: FailureScenario[] = [
        { id: '1', description: 'A', probability: 'HIGH', impact: 'LOW', category: 'FINANCIAL', rootCause: 'x' },
        { id: '2', description: 'B', probability: 'LOW', impact: 'HIGH', category: 'LEGAL', rootCause: 'y' },
        { id: '3', description: 'C', probability: 'MEDIUM', impact: 'MEDIUM', category: 'TECHNICAL', rootCause: 'z' },
      ];
      const score = calculateRiskScore(scenarios);
      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThan(80);
    });
  });
});
