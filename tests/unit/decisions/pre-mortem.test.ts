import {
  runPreMortem,
  calculateRiskScore,
} from '@/modules/decisions/services/pre-mortem';
import type { FailureScenario, PreMortemRequest } from '@/modules/decisions/types';

describe('Pre-Mortem Analysis', () => {
  describe('runPreMortem', () => {
    it('should generate at least 3 failure scenarios', async () => {
      const request: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '90_DAYS',
      };

      const result = await runPreMortem(request);
      expect(result.failureScenarios.length).toBeGreaterThanOrEqual(3);
    });

    it('should generate mitigations for each scenario', async () => {
      const request: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '90_DAYS',
      };

      const result = await runPreMortem(request);
      for (const scenario of result.failureScenarios) {
        const mitigation = result.mitigationPlan.find(
          (m) => m.scenarioId === scenario.id
        );
        expect(mitigation).toBeDefined();
        expect(mitigation!.action).toBeTruthy();
      }
    });

    it('should produce kill signals', async () => {
      const request: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '1_YEAR',
      };

      const result = await runPreMortem(request);
      expect(result.killSignals.length).toBeGreaterThanOrEqual(3);
    });

    it('should return risk score between 0 and 100', async () => {
      const request: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '30_DAYS',
      };

      const result = await runPreMortem(request);
      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(100);
    });

    it('should generate more scenarios for longer time horizons', async () => {
      const shortReq: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '30_DAYS',
      };
      const longReq: PreMortemRequest = {
        decisionId: 'dec-1',
        chosenOptionId: 'opt-1',
        timeHorizon: '3_YEARS',
      };

      const shortResult = await runPreMortem(shortReq);
      const longResult = await runPreMortem(longReq);
      expect(longResult.failureScenarios.length).toBeGreaterThanOrEqual(
        shortResult.failureScenarios.length
      );
    });

    it('should have valid categories for all scenarios', async () => {
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
