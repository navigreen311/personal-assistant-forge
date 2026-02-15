import {
  scoreToGrade,
  getGradeBreakdown,
} from '@/modules/ai-quality/services/accuracy-scorecard-service';
import type { AccuracyScorecard } from '@/modules/ai-quality/types';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    workflow: { findMany: jest.fn() },
  },
}));

describe('generateScorecard', () => {
  it('should assign grade A for overall >= 90', () => {
    expect(scoreToGrade(90)).toBe('A');
    expect(scoreToGrade(95)).toBe('A');
    expect(scoreToGrade(100)).toBe('A');
  });

  it('should assign grade B for overall >= 80', () => {
    expect(scoreToGrade(80)).toBe('B');
    expect(scoreToGrade(85)).toBe('B');
    expect(scoreToGrade(89)).toBe('B');
  });

  it('should assign grade C for overall >= 70', () => {
    expect(scoreToGrade(70)).toBe('C');
    expect(scoreToGrade(75)).toBe('C');
    expect(scoreToGrade(79)).toBe('C');
  });

  it('should assign grade D for overall >= 60', () => {
    expect(scoreToGrade(60)).toBe('D');
    expect(scoreToGrade(65)).toBe('D');
    expect(scoreToGrade(69)).toBe('D');
  });

  it('should assign grade F for overall < 60', () => {
    expect(scoreToGrade(59)).toBe('F');
    expect(scoreToGrade(40)).toBe('F');
    expect(scoreToGrade(0)).toBe('F');
  });
});

describe('getGradeBreakdown', () => {
  it('should return all 4 dimensions with individual grades', () => {
    const scorecard: AccuracyScorecard = {
      entityId: 'entity1',
      period: '2026-02-W7',
      triageAccuracy: 92,
      draftApprovalRate: 85,
      missedDeadlineRate: 15,
      automationSuccessRate: 78,
      overallGrade: 'B',
    };

    const breakdown = getGradeBreakdown(scorecard);
    expect(breakdown).toHaveLength(4);
    expect(breakdown[0].dimension).toBe('Triage Accuracy');
    expect(breakdown[0].grade).toBe('A');
    expect(breakdown[1].dimension).toBe('Draft Approval Rate');
    expect(breakdown[1].grade).toBe('B');
    expect(breakdown[2].dimension).toBe('Deadline Performance');
    expect(breakdown[2].grade).toBe('B');
    expect(breakdown[3].dimension).toBe('Automation Success');
    expect(breakdown[3].grade).toBe('C');
  });

  it('should provide improvement suggestions for low-scoring dimensions', () => {
    const scorecard: AccuracyScorecard = {
      entityId: 'entity1',
      period: '2026-02-W7',
      triageAccuracy: 55,
      draftApprovalRate: 45,
      missedDeadlineRate: 50,
      automationSuccessRate: 40,
      overallGrade: 'F',
    };

    const breakdown = getGradeBreakdown(scorecard);
    for (const dim of breakdown) {
      expect(dim.suggestion).toBeTruthy();
      expect(dim.suggestion.length).toBeGreaterThan(0);
    }
  });
});
