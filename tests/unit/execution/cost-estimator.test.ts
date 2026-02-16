// Mock Prisma client (cost-estimator imports it for getDailyCostSummary)
jest.mock('../../../src/lib/db', () => ({
  __esModule: true,
  default: {
    actionLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock date-fns ESM module
jest.mock('date-fns', () => ({
  startOfDay: (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  endOfDay: (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
}));

import {
  estimateActionCost,
  estimateRunbookCost,
} from '../../../src/modules/execution/services/cost-estimator';
import type { Runbook } from '../../../src/modules/execution/types';

describe('CostEstimator', () => {
  describe('estimateActionCost', () => {
    it('should estimate SEND_MESSAGE via EMAIL at $0.001', () => {
      const result = estimateActionCost('SEND_MESSAGE', { channel: 'EMAIL' });

      expect(result.actionType).toBe('SEND_MESSAGE');
      expect(result.estimatedCost).toBe(0.001);
      expect(result.currency).toBe('USD');
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].item).toBe('Email message');
      expect(result.breakdown[0].cost).toBe(0.001);
      expect(result.confidence).toBe(0.8);
    });

    it('should estimate SEND_MESSAGE via SMS at $0.01', () => {
      const result = estimateActionCost('SEND_MESSAGE', { channel: 'SMS' });

      expect(result.estimatedCost).toBe(0.01);
      expect(result.breakdown[0].item).toBe('SMS message');
      expect(result.breakdown[0].cost).toBe(0.01);
    });

    it('should estimate SEND_MESSAGE via in-app at $0', () => {
      const result = estimateActionCost('SEND_MESSAGE', { channel: 'IN_APP' });

      expect(result.estimatedCost).toBe(0);
      expect(result.breakdown[0].cost).toBe(0);
      expect(result.breakdown[0].unit).toContain('in-app');
    });

    it('should default SEND_MESSAGE channel to EMAIL', () => {
      const result = estimateActionCost('SEND_MESSAGE', {});

      expect(result.estimatedCost).toBe(0.001);
      expect(result.breakdown[0].item).toBe('Email message');
    });

    it('should estimate BULK_SEND based on recipient count', () => {
      const result = estimateActionCost('BULK_SEND', {
        recipientCount: 100,
        channel: 'EMAIL',
      });

      // 100 * $0.001 = $0.1
      expect(result.estimatedCost).toBe(0.1);
      expect(result.breakdown[0].item).toContain('100 recipients');
    });

    it('should estimate BULK_SEND via SMS at higher rate', () => {
      const result = estimateActionCost('BULK_SEND', {
        recipientCount: 50,
        channel: 'SMS',
      });

      // 50 * $0.01 = $0.5
      expect(result.estimatedCost).toBe(0.5);
    });

    it('should estimate BULK_SEND using recipients array length', () => {
      const result = estimateActionCost('BULK_SEND', {
        recipients: ['a', 'b', 'c', 'd', 'e'],
        channel: 'EMAIL',
      });

      // 5 * $0.001 = $0.005
      expect(result.estimatedCost).toBe(0.005);
    });

    it('should estimate AI_ANALYSIS based on token count', () => {
      const result = estimateActionCost('AI_ANALYSIS', {
        tokenCount: 5000,
      });

      // (5000 / 1000) * $0.02 = $0.1
      expect(result.estimatedCost).toBe(0.1);
      expect(result.breakdown[0].item).toBe('AI token processing');
      expect(result.breakdown[0].unit).toBe('per 1K tokens');
    });

    it('should default AI_ANALYSIS to 1000 tokens', () => {
      const result = estimateActionCost('AI_ANALYSIS', {});

      // (1000 / 1000) * $0.02 = $0.02
      expect(result.estimatedCost).toBe(0.02);
    });

    it('should estimate AI_ANALYSIS using tokens parameter', () => {
      const result = estimateActionCost('AI_ANALYSIS', {
        tokens: 2000,
      });

      // (2000 / 1000) * $0.02 = $0.04
      expect(result.estimatedCost).toBe(0.04);
    });

    it('should estimate GENERATE_DOCUMENT at $0.05', () => {
      const result = estimateActionCost('GENERATE_DOCUMENT', {});

      expect(result.estimatedCost).toBe(0.05);
      expect(result.breakdown[0].unit).toBe('per document');
    });

    it('should estimate CALL_API at $0.01', () => {
      const result = estimateActionCost('CALL_API', {});

      expect(result.estimatedCost).toBe(0.01);
      expect(result.breakdown[0].unit).toBe('per API call');
    });

    it('should estimate TRIGGER_WORKFLOW at $0.01', () => {
      const result = estimateActionCost('TRIGGER_WORKFLOW', {});

      expect(result.estimatedCost).toBe(0.01);
    });

    it('should estimate free actions (CREATE_TASK, UPDATE_RECORD, etc.) at $0', () => {
      const freeActions = [
        'CREATE_TASK',
        'UPDATE_RECORD',
        'DELETE_RECORD',
        'DELETE_CONTACT',
        'DELETE_PROJECT',
        'CREATE_CONTACT',
        'CREATE_PROJECT',
        'FINANCIAL_ACTION',
        'BULK_DELETE',
      ];

      for (const actionType of freeActions) {
        const result = estimateActionCost(actionType, {});
        expect(result.estimatedCost).toBe(0);
        expect(result.confidence).toBe(0.95); // free actions have high confidence
      }
    });

    it('should return low confidence for unknown action types', () => {
      const result = estimateActionCost('UNKNOWN_ACTION', {});

      expect(result.estimatedCost).toBe(0);
      expect(result.confidence).toBe(0.3);
      expect(result.breakdown[0].unit).toBe('unknown action type');
    });

    it('should round costs to 4 decimal places', () => {
      const result = estimateActionCost('AI_ANALYSIS', {
        tokenCount: 1500,
      });

      // (1500 / 1000) * $0.02 = $0.03
      expect(result.estimatedCost).toBe(0.03);
      // Verify rounding precision
      const str = result.estimatedCost.toString();
      const decimalPart = str.split('.')[1] ?? '';
      expect(decimalPart.length).toBeLessThanOrEqual(4);
    });
  });

  describe('estimateRunbookCost', () => {
    it('should aggregate costs for all runbook steps', () => {
      const runbook: Runbook = {
        id: 'rb-1',
        name: 'Test Runbook',
        description: 'Test',
        entityId: 'entity-1',
        steps: [
          {
            order: 1,
            name: 'Send Email',
            description: 'Send email',
            actionType: 'SEND_MESSAGE',
            parameters: { channel: 'EMAIL' },
            requiresApproval: false,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
          {
            order: 2,
            name: 'Generate Doc',
            description: 'Generate document',
            actionType: 'GENERATE_DOCUMENT',
            parameters: {},
            requiresApproval: false,
            maxBlastRadius: 'MEDIUM',
            continueOnFailure: false,
          },
          {
            order: 3,
            name: 'Create Task',
            description: 'Create a task',
            actionType: 'CREATE_TASK',
            parameters: {},
            requiresApproval: false,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
        ],
        tags: ['test'],
        isActive: true,
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = estimateRunbookCost(runbook);

      // $0.001 (email) + $0.05 (doc) + $0 (task) = $0.051
      expect(result.actionType).toBe('RUNBOOK');
      expect(result.estimatedCost).toBe(0.051);
      expect(result.currency).toBe('USD');
      expect(result.breakdown).toHaveLength(3);

      // Breakdown items should be prefixed with step number
      expect(result.breakdown[0].item).toContain('Step 1:');
      expect(result.breakdown[1].item).toContain('Step 2:');
      expect(result.breakdown[2].item).toContain('Step 3:');
    });

    it('should compute average confidence across steps', () => {
      const runbook: Runbook = {
        id: 'rb-2',
        name: 'Mixed Runbook',
        description: 'Test',
        entityId: 'entity-1',
        steps: [
          {
            order: 1,
            name: 'Free Action',
            description: 'Free',
            actionType: 'CREATE_TASK',
            parameters: {},
            requiresApproval: false,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
          {
            order: 2,
            name: 'Paid Action',
            description: 'Paid',
            actionType: 'SEND_MESSAGE',
            parameters: { channel: 'EMAIL' },
            requiresApproval: false,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
        ],
        tags: [],
        isActive: true,
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = estimateRunbookCost(runbook);

      // CREATE_TASK confidence = 0.95, SEND_MESSAGE confidence = 0.8
      // Average = (0.95 + 0.8) / 2 = 0.875 -> rounded to 0.88
      expect(result.confidence).toBe(0.88);
    });

    it('should handle empty runbook steps', () => {
      const runbook: Runbook = {
        id: 'rb-3',
        name: 'Empty Runbook',
        description: 'No steps',
        entityId: 'entity-1',
        steps: [],
        tags: [],
        isActive: true,
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = estimateRunbookCost(runbook);

      expect(result.estimatedCost).toBe(0);
      expect(result.breakdown).toHaveLength(0);
      expect(result.confidence).toBe(0.5); // default for empty
    });
  });
});
