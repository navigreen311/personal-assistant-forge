import {
  createMatrix,
  validateWeights,
  runSensitivityAnalysis,
} from '@/modules/decisions/services/decision-matrix';
import type { MatrixCriterion, MatrixScore } from '@/modules/decisions/types';

describe('Decision Matrix', () => {
  const baseCriteria: MatrixCriterion[] = [
    { id: 'c1', name: 'Cost', weight: 0.4 },
    { id: 'c2', name: 'Risk', weight: 0.35 },
    { id: 'c3', name: 'Impact', weight: 0.25 },
  ];

  const baseScores: MatrixScore[] = [
    { criterionId: 'c1', optionId: 'optA', score: 8, rationale: 'Low cost' },
    { criterionId: 'c2', optionId: 'optA', score: 7, rationale: 'Low risk' },
    { criterionId: 'c3', optionId: 'optA', score: 5, rationale: 'Moderate impact' },
    { criterionId: 'c1', optionId: 'optB', score: 4, rationale: 'High cost' },
    { criterionId: 'c2', optionId: 'optB', score: 5, rationale: 'Medium risk' },
    { criterionId: 'c3', optionId: 'optB', score: 9, rationale: 'High impact' },
    { criterionId: 'c1', optionId: 'optC', score: 6, rationale: 'Medium cost' },
    { criterionId: 'c2', optionId: 'optC', score: 6, rationale: 'Medium risk' },
    { criterionId: 'c3', optionId: 'optC', score: 7, rationale: 'Good impact' },
  ];

  describe('validateWeights', () => {
    it('should accept weights summing to 1.0', () => {
      expect(validateWeights(baseCriteria)).toEqual({ valid: true });
    });

    it('should accept weights within 0.01 tolerance', () => {
      const criteria = [
        { id: 'a', name: 'A', weight: 0.333 },
        { id: 'b', name: 'B', weight: 0.333 },
        { id: 'c', name: 'C', weight: 0.334 },
      ];
      expect(validateWeights(criteria)).toEqual({ valid: true });
    });

    it('should reject weights not summing to 1.0', () => {
      const criteria = [
        { id: 'a', name: 'A', weight: 0.5 },
        { id: 'b', name: 'B', weight: 0.3 },
      ];
      const result = validateWeights(criteria);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Weights sum to');
    });

    it('should reject negative weights', () => {
      const criteria = [
        { id: 'a', name: 'A', weight: -0.2 },
        { id: 'b', name: 'B', weight: 1.2 },
      ];
      const result = validateWeights(criteria);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('negative weight');
    });

    it('should reject empty criteria', () => {
      const result = validateWeights([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('At least one criterion');
    });
  });

  describe('createMatrix', () => {
    it('should calculate correct weighted totals', () => {
      const result = createMatrix('dec-1', baseCriteria, baseScores);

      // optA: 8*0.4 + 7*0.35 + 5*0.25 = 3.2 + 2.45 + 1.25 = 6.9
      // optB: 4*0.4 + 5*0.35 + 9*0.25 = 1.6 + 1.75 + 2.25 = 5.6
      // optC: 6*0.4 + 6*0.35 + 7*0.25 = 2.4 + 2.1 + 1.75 = 6.25
      expect(result.optionScores).toHaveLength(3);
      expect(result.winner).toBe('optA');

      const optA = result.optionScores.find((o) => o.optionId === 'optA');
      expect(optA!.weightedTotal).toBeCloseTo(6.9, 1);
      expect(optA!.rank).toBe(1);
    });

    it('should rank options descending by total', () => {
      const result = createMatrix('dec-1', baseCriteria, baseScores);
      const totals = result.optionScores.map((o) => o.weightedTotal);
      for (let i = 0; i < totals.length - 1; i++) {
        expect(totals[i]).toBeGreaterThanOrEqual(totals[i + 1]);
      }
    });

    it('should calculate correct margin between #1 and #2', () => {
      const result = createMatrix('dec-1', baseCriteria, baseScores);
      // 6.9 - 6.25 = 0.65
      expect(result.margin).toBeCloseTo(0.65, 1);
    });

    it('should throw on invalid weights', () => {
      const badCriteria = [
        { id: 'a', name: 'A', weight: 0.5 },
        { id: 'b', name: 'B', weight: 0.2 },
      ];
      expect(() =>
        createMatrix('dec-1', badCriteria, baseScores)
      ).toThrow('Weights sum to');
    });

    it('should include sensitivity analysis in result', () => {
      const result = createMatrix('dec-1', baseCriteria, baseScores);
      expect(result.sensitivityAnalysis).toHaveLength(baseCriteria.length);
      for (const sa of result.sensitivityAnalysis) {
        expect(['NONE', 'MINOR', 'MAJOR']).toContain(sa.impactOnRanking);
      }
    });
  });
});
