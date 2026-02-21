import {
  generateScorecard,
  getScorecardHistory,
  getGradeBreakdown,
  scoreToGrade,
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

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    suggestions: {
      'Triage Accuracy': 'AI: Improve triage rules.',
      'Draft Approval Rate': 'AI: Refine draft templates.',
      'Deadline Performance': 'AI: Add buffer time.',
      'Automation Success': 'AI: Fix failing workflow steps.',
    },
  }),
}));

const { prisma } = require('@/lib/db');
const { generateJSON } = require('@/lib/ai');

describe('AccuracyScorecardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scoreToGrade', () => {
    it('should return A for scores >= 90', () => {
      expect(scoreToGrade(90)).toBe('A');
      expect(scoreToGrade(95)).toBe('A');
      expect(scoreToGrade(100)).toBe('A');
    });

    it('should return B for scores >= 80 and < 90', () => {
      expect(scoreToGrade(80)).toBe('B');
      expect(scoreToGrade(89)).toBe('B');
    });

    it('should return C for scores >= 70 and < 80', () => {
      expect(scoreToGrade(70)).toBe('C');
      expect(scoreToGrade(79)).toBe('C');
    });

    it('should return D for scores >= 60 and < 70', () => {
      expect(scoreToGrade(60)).toBe('D');
      expect(scoreToGrade(69)).toBe('D');
    });

    it('should return F for scores < 60', () => {
      expect(scoreToGrade(59)).toBe('F');
      expect(scoreToGrade(0)).toBe('F');
    });
  });

  describe('generateScorecard', () => {
    it('should return 100% triage accuracy when no triage actions exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const result = await generateScorecard('entity-1', '2026-02');

      expect(result.triageAccuracy).toBe(100);
      expect(result.draftApprovalRate).toBe(100);
      expect(result.missedDeadlineRate).toBe(0);
      expect(result.automationSuccessRate).toBe(100);
      expect(result.overallGrade).toBe('A');
    });

    it('should calculate triage accuracy based on ROLLED_BACK actions', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
        { actionType: 'TRIAGE', status: 'COMPLETED' },
        { actionType: 'TRIAGE', status: 'COMPLETED' },
        { actionType: 'TRIAGE', status: 'ROLLED_BACK' },
        { actionType: 'TRIAGE', status: 'COMPLETED' },
      ]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const result = await generateScorecard('entity-1', '2026-02');

      // 3 out of 4 are not ROLLED_BACK = 75%
      expect(result.triageAccuracy).toBe(75);
    });

    it('should calculate draft approval rate from messages', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { draftStatus: 'APPROVED' },
        { draftStatus: 'SENT' },
        { draftStatus: 'REJECTED' },
        { draftStatus: 'DRAFT' },
      ]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const result = await generateScorecard('entity-1', '2026-02');

      // 2 out of 4 approved/sent = 50%
      expect(result.draftApprovalRate).toBe(50);
    });

    it('should calculate missed deadline rate from tasks', async () => {
      const pastDate = new Date('2026-01-01');
      const futureUpdate = new Date('2026-01-10');
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([
        { status: 'DONE', dueDate: pastDate, updatedAt: new Date('2025-12-30') },
        { status: 'IN_PROGRESS', dueDate: pastDate, updatedAt: futureUpdate },
        { status: 'DONE', dueDate: pastDate, updatedAt: futureUpdate },
      ]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const result = await generateScorecard('entity-1', '2026-02');

      // Task 1: DONE and updatedAt < dueDate => not missed
      // Task 2: status !== DONE => missed
      // Task 3: DONE but updatedAt > dueDate => missed
      expect(result.missedDeadlineRate).toBe(67); // 2/3 rounded
    });

    it('should calculate automation success rate from workflows', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([
        { successRate: 90 },
        { successRate: 80 },
        { successRate: 70 },
      ]);

      const result = await generateScorecard('entity-1', '2026-02');

      // Average: (90+80+70)/3 = 80
      expect(result.automationSuccessRate).toBe(80);
    });

    it('should compute overall grade from all four dimensions', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
        { actionType: 'TRIAGE', status: 'COMPLETED' },
      ]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { draftStatus: 'APPROVED' },
      ]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([
        { successRate: 100 },
      ]);

      const result = await generateScorecard('entity-1', '2026-02');

      // triageAccuracy=100, draftApprovalRate=100, missedDeadlineRate=0, automationSuccessRate=100
      // overall = (100+100+100+100)/4 = 100 => A
      expect(result.overallGrade).toBe('A');
      expect(result.entityId).toBe('entity-1');
      expect(result.period).toBe('2026-02');
    });

    it('should handle week period format correctly', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const result = await generateScorecard('entity-1', '2026-02-W7');

      expect(result.period).toBe('2026-02-W7');
      expect(prisma.actionLog.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getScorecardHistory', () => {
    it('should return scorecards for the requested number of periods', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const results = await getScorecardHistory('entity-1', 3);

      expect(results).toHaveLength(3);
      for (const scorecard of results) {
        expect(scorecard.entityId).toBe('entity-1');
        expect(scorecard.period).toBeDefined();
      }
    });

    it('should return an empty array when 0 periods are requested', async () => {
      const results = await getScorecardHistory('entity-1', 0);
      expect(results).toHaveLength(0);
    });
  });

  describe('getGradeBreakdown', () => {
    it('should return breakdown with all 4 dimensions', async () => {
      const scorecard: AccuracyScorecard = {
        entityId: 'entity-1',
        period: '2026-02-W7',
        triageAccuracy: 95,
        draftApprovalRate: 82,
        missedDeadlineRate: 10,
        automationSuccessRate: 75,
        overallGrade: 'B',
      };

      const breakdown = await getGradeBreakdown(scorecard);

      expect(breakdown).toHaveLength(4);
      expect(breakdown[0].dimension).toBe('Triage Accuracy');
      expect(breakdown[0].score).toBe(95);
      expect(breakdown[0].grade).toBe('A');
      expect(breakdown[1].dimension).toBe('Draft Approval Rate');
      expect(breakdown[1].score).toBe(82);
      expect(breakdown[1].grade).toBe('B');
      expect(breakdown[2].dimension).toBe('Deadline Performance');
      expect(breakdown[2].score).toBe(90);
      expect(breakdown[2].grade).toBe('A');
      expect(breakdown[3].dimension).toBe('Automation Success');
      expect(breakdown[3].score).toBe(75);
      expect(breakdown[3].grade).toBe('C');
    });

    it('should use AI-generated suggestions when available', async () => {
      const scorecard: AccuracyScorecard = {
        entityId: 'entity-1',
        period: '2026-02-W7',
        triageAccuracy: 50,
        draftApprovalRate: 40,
        missedDeadlineRate: 60,
        automationSuccessRate: 30,
        overallGrade: 'F',
      };

      const breakdown = await getGradeBreakdown(scorecard);

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(breakdown[0].suggestion).toBe('AI: Improve triage rules.');
    });

    it('should fall back to default suggestions when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const scorecard: AccuracyScorecard = {
        entityId: 'entity-1',
        period: '2026-02-W7',
        triageAccuracy: 50,
        draftApprovalRate: 40,
        missedDeadlineRate: 60,
        automationSuccessRate: 30,
        overallGrade: 'F',
      };

      const breakdown = await getGradeBreakdown(scorecard);

      expect(breakdown).toHaveLength(4);
      expect(breakdown[0].suggestion).toBe(
        'Review triage rules and adjust priority thresholds.'
      );
      expect(breakdown[1].suggestion).toBe(
        'Improve draft templates and incorporate user tone preferences.'
      );
    });

    it('should use default suggestion when AI returns partial results', async () => {
      generateJSON.mockResolvedValueOnce({
        suggestions: {
          'Triage Accuracy': 'AI: Custom triage advice.',
          // Missing other dimensions
        },
      });

      const scorecard: AccuracyScorecard = {
        entityId: 'entity-1',
        period: '2026-02-W7',
        triageAccuracy: 80,
        draftApprovalRate: 70,
        missedDeadlineRate: 20,
        automationSuccessRate: 60,
        overallGrade: 'C',
      };

      const breakdown = await getGradeBreakdown(scorecard);

      expect(breakdown[0].suggestion).toBe('AI: Custom triage advice.');
      expect(breakdown[1].suggestion).toBe(
        'Improve draft templates and incorporate user tone preferences.'
      );
    });
  });
});
