import { runSensitivityAnalysis } from '@/modules/decisions/services/decision-matrix';
import type { MatrixCriterion, MatrixScore } from '@/modules/decisions/types';

describe('Sensitivity Analysis', () => {
  it('should return results for each criterion', () => {
    const criteria: MatrixCriterion[] = [
      { id: 'c1', name: 'Cost', weight: 0.5 },
      { id: 'c2', name: 'Quality', weight: 0.5 },
    ];
    const scores: MatrixScore[] = [
      { criterionId: 'c1', optionId: 'a', score: 9, rationale: '' },
      { criterionId: 'c2', optionId: 'a', score: 3, rationale: '' },
      { criterionId: 'c1', optionId: 'b', score: 3, rationale: '' },
      { criterionId: 'c2', optionId: 'b', score: 9, rationale: '' },
    ];

    const results = runSensitivityAnalysis(criteria, scores);
    expect(results).toHaveLength(2);
    expect(results[0].criterionId).toBe('c1');
    expect(results[1].criterionId).toBe('c2');
  });

  it('should detect tipping weight when options are close', () => {
    const criteria: MatrixCriterion[] = [
      { id: 'c1', name: 'Cost', weight: 0.5 },
      { id: 'c2', name: 'Quality', weight: 0.5 },
    ];
    const scores: MatrixScore[] = [
      { criterionId: 'c1', optionId: 'a', score: 9, rationale: '' },
      { criterionId: 'c2', optionId: 'a', score: 3, rationale: '' },
      { criterionId: 'c1', optionId: 'b', score: 3, rationale: '' },
      { criterionId: 'c2', optionId: 'b', score: 9, rationale: '' },
    ];

    const results = runSensitivityAnalysis(criteria, scores);
    // When c1 weight drops, option B (strong on c2) should win
    const c1Result = results.find((r) => r.criterionId === 'c1');
    expect(c1Result).toBeDefined();
    // One of the criteria should have a tipping weight
    const hasTipping = results.some((r) => r.tippingWeight !== null);
    expect(hasTipping).toBe(true);
  });

  it('should return NONE impact when winner is very dominant', () => {
    const criteria: MatrixCriterion[] = [
      { id: 'c1', name: 'Cost', weight: 0.5 },
      { id: 'c2', name: 'Quality', weight: 0.5 },
    ];
    const scores: MatrixScore[] = [
      { criterionId: 'c1', optionId: 'a', score: 10, rationale: '' },
      { criterionId: 'c2', optionId: 'a', score: 10, rationale: '' },
      { criterionId: 'c1', optionId: 'b', score: 1, rationale: '' },
      { criterionId: 'c2', optionId: 'b', score: 1, rationale: '' },
    ];

    const results = runSensitivityAnalysis(criteria, scores);
    // When one option dominates on ALL criteria, no weight change can flip it
    for (const r of results) {
      expect(r.impactOnRanking).toBe('NONE');
      expect(r.tippingWeight).toBeNull();
    }
  });

  it('should handle tied options', () => {
    const criteria: MatrixCriterion[] = [
      { id: 'c1', name: 'Cost', weight: 0.5 },
      { id: 'c2', name: 'Quality', weight: 0.5 },
    ];
    const scores: MatrixScore[] = [
      { criterionId: 'c1', optionId: 'a', score: 5, rationale: '' },
      { criterionId: 'c2', optionId: 'a', score: 5, rationale: '' },
      { criterionId: 'c1', optionId: 'b', score: 5, rationale: '' },
      { criterionId: 'c2', optionId: 'b', score: 5, rationale: '' },
    ];

    const results = runSensitivityAnalysis(criteria, scores);
    expect(results).toHaveLength(2);
    // Tied → no tipping weight since winner doesn't change
    for (const r of results) {
      expect(r.tippingWeight).toBeNull();
    }
  });
});
