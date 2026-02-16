// Mock uuid ESM module
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import {
  createRunbook,
  getRunbook,
  updateRunbook,
  deleteRunbook,
  listRunbooks,
  executeRunbook,
  getRunbookExecution,
  listRunbookExecutions,
  createFromTemplate,
  describeCronExpression,
  BUILTIN_TEMPLATES,
  _clearRunbookStores,
} from '../../../src/modules/execution/services/runbook-service';
import { _clearActionStore } from '../../../src/modules/execution/services/action-queue';
import { _clearGateStore } from '../../../src/modules/execution/services/execution-gate';

// Mock Prisma client
jest.mock('../../../src/lib/db', () => ({
  __esModule: true,
  default: {
    actionLog: {
      create: jest.fn().mockResolvedValue({ id: 'action-log-mock-id' }),
      update: jest.fn().mockResolvedValue({}),
    },
    consentReceipt: {
      create: jest.fn().mockResolvedValue({ id: 'consent-receipt-mock-id' }),
    },
  },
}));

describe('RunbookService', () => {
  beforeEach(() => {
    _clearRunbookStores();
    _clearActionStore();
    _clearGateStore();
  });

  const defaultRunbookParams = {
    name: 'Test Runbook',
    description: 'A test runbook',
    entityId: 'entity-1',
    steps: [
      {
        order: 1,
        name: 'Step 1',
        description: 'First step',
        actionType: 'CREATE_TASK',
        parameters: { title: 'New Task' },
        requiresApproval: false,
        maxBlastRadius: 'LOW' as const,
        continueOnFailure: false,
      },
      {
        order: 2,
        name: 'Step 2',
        description: 'Second step',
        actionType: 'CREATE_CONTACT',
        parameters: { name: 'Alice' },
        requiresApproval: false,
        maxBlastRadius: 'LOW' as const,
        continueOnFailure: false,
      },
    ],
    tags: ['test', 'automation'],
    isActive: true,
    createdBy: 'user-1',
  };

  describe('createRunbook', () => {
    it('should create a runbook with generated ID and timestamps', async () => {
      const runbook = await createRunbook(defaultRunbookParams);

      expect(runbook.id).toBeDefined();
      expect(runbook.name).toBe('Test Runbook');
      expect(runbook.entityId).toBe('entity-1');
      expect(runbook.steps).toHaveLength(2);
      expect(runbook.tags).toEqual(['test', 'automation']);
      expect(runbook.isActive).toBe(true);
      expect(runbook.createdBy).toBe('user-1');
      expect(runbook.createdAt).toBeInstanceOf(Date);
      expect(runbook.updatedAt).toBeInstanceOf(Date);
    });

    it('should store the runbook for retrieval', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      const retrieved = await getRunbook(runbook.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(runbook.id);
      expect(retrieved!.name).toBe('Test Runbook');
    });
  });

  describe('getRunbook', () => {
    it('should return null for non-existent runbook', async () => {
      const result = await getRunbook('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateRunbook', () => {
    it('should update runbook fields while preserving ID and createdAt', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      const updated = await updateRunbook(runbook.id, {
        name: 'Updated Runbook',
        description: 'Updated description',
      });

      expect(updated.id).toBe(runbook.id);
      expect(updated.name).toBe('Updated Runbook');
      expect(updated.description).toBe('Updated description');
      expect(updated.createdAt).toEqual(runbook.createdAt);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        runbook.updatedAt.getTime()
      );
    });

    it('should throw for non-existent runbook', async () => {
      await expect(
        updateRunbook('nonexistent', { name: 'X' })
      ).rejects.toThrow('Runbook nonexistent not found');
    });
  });

  describe('deleteRunbook', () => {
    it('should delete an existing runbook', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      await deleteRunbook(runbook.id);

      const result = await getRunbook(runbook.id);
      expect(result).toBeNull();
    });

    it('should throw for non-existent runbook', async () => {
      await expect(deleteRunbook('nonexistent')).rejects.toThrow(
        'Runbook nonexistent not found'
      );
    });
  });

  describe('listRunbooks', () => {
    it('should list runbooks by entityId', async () => {
      await createRunbook({ ...defaultRunbookParams, entityId: 'entity-1' });
      await createRunbook({ ...defaultRunbookParams, entityId: 'entity-2' });

      const result = await listRunbooks('entity-1');
      expect(result).toHaveLength(1);
      expect(result[0].entityId).toBe('entity-1');
    });

    it('should filter by isActive', async () => {
      await createRunbook({ ...defaultRunbookParams, isActive: true });
      await createRunbook({ ...defaultRunbookParams, isActive: false });

      const active = await listRunbooks('entity-1', { isActive: true });
      expect(active).toHaveLength(1);
      expect(active[0].isActive).toBe(true);

      const inactive = await listRunbooks('entity-1', { isActive: false });
      expect(inactive).toHaveLength(1);
      expect(inactive[0].isActive).toBe(false);
    });

    it('should filter by tag', async () => {
      await createRunbook({
        ...defaultRunbookParams,
        tags: ['finance', 'weekly'],
      });
      await createRunbook({
        ...defaultRunbookParams,
        tags: ['onboarding'],
      });

      const finance = await listRunbooks('entity-1', { tag: 'finance' });
      expect(finance).toHaveLength(1);
      expect(finance[0].tags).toContain('finance');
    });

    it('should return empty for non-matching entityId', async () => {
      await createRunbook(defaultRunbookParams);

      const result = await listRunbooks('nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('executeRunbook', () => {
    it('should execute all steps sequentially', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      const execution = await executeRunbook(runbook.id, 'user-1');

      expect(execution.id).toBeDefined();
      expect(execution.runbookId).toBe(runbook.id);
      expect(execution.triggeredBy).toBe('user-1');
      expect(execution.startedAt).toBeInstanceOf(Date);

      // Both steps should complete (CREATE_TASK and CREATE_CONTACT are LOW blast radius)
      expect(execution.status).toBe('COMPLETED');
      expect(execution.completedAt).toBeInstanceOf(Date);

      // Step results
      expect(execution.stepResults).toHaveLength(2);
      expect(execution.stepResults[0].status).toBe('COMPLETED');
      expect(execution.stepResults[0].stepName).toBe('Step 1');
      expect(execution.stepResults[1].status).toBe('COMPLETED');
      expect(execution.stepResults[1].stepName).toBe('Step 2');

      // Each completed step should have an actionId
      expect(execution.stepResults[0].actionId).toBeDefined();
      expect(execution.stepResults[1].actionId).toBeDefined();
    });

    it('should pause when step requires approval', async () => {
      const runbook = await createRunbook({
        ...defaultRunbookParams,
        steps: [
          {
            order: 1,
            name: 'Auto Step',
            description: 'Auto',
            actionType: 'CREATE_TASK',
            parameters: {},
            requiresApproval: false,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
          {
            order: 2,
            name: 'Approval Step',
            description: 'Needs approval',
            actionType: 'SEND_MESSAGE',
            parameters: { channel: 'EMAIL' },
            requiresApproval: true,
            maxBlastRadius: 'MEDIUM',
            continueOnFailure: false,
          },
        ],
      });

      const execution = await executeRunbook(runbook.id, 'user-1');

      expect(execution.status).toBe('PAUSED');
      expect(execution.stepResults[0].status).toBe('COMPLETED');
      expect(execution.stepResults[1].status).toBe('AWAITING_APPROVAL');
    });

    it('should pause when blast radius exceeds step max', async () => {
      // BULK_SEND with recipients will have higher blast radius than LOW
      const runbook = await createRunbook({
        ...defaultRunbookParams,
        steps: [
          {
            order: 1,
            name: 'Bulk Send',
            description: 'Send to many',
            actionType: 'BULK_SEND',
            parameters: { recipientCount: 200, channel: 'EMAIL' },
            requiresApproval: false,
            maxBlastRadius: 'LOW', // very restrictive
            continueOnFailure: false,
          },
        ],
      });

      const execution = await executeRunbook(runbook.id, 'user-1');

      // BULK_SEND with 200 recipients will score higher than LOW
      // The step maxBlastRadius is LOW, so it should pause
      expect(execution.status).toBe('PAUSED');
      expect(execution.stepResults[0].status).toBe('AWAITING_APPROVAL');
      expect(execution.stepResults[0].error).toContain('exceeds max');
    });

    it('should update runbook lastRunAt and lastRunStatus on completion', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      await executeRunbook(runbook.id, 'user-1');

      const updated = await getRunbook(runbook.id);
      expect(updated!.lastRunAt).toBeInstanceOf(Date);
      expect(updated!.lastRunStatus).toBe('SUCCESS');
    });

    it('should update runbook lastRunStatus to PARTIAL when paused', async () => {
      const runbook = await createRunbook({
        ...defaultRunbookParams,
        steps: [
          {
            order: 1,
            name: 'Approval Step',
            description: 'Needs approval',
            actionType: 'CREATE_TASK',
            parameters: {},
            requiresApproval: true,
            maxBlastRadius: 'LOW',
            continueOnFailure: false,
          },
        ],
      });

      await executeRunbook(runbook.id, 'user-1');

      const updated = await getRunbook(runbook.id);
      expect(updated!.lastRunStatus).toBe('PARTIAL');
    });

    it('should throw for non-existent runbook', async () => {
      await expect(executeRunbook('nonexistent', 'user-1')).rejects.toThrow(
        'Runbook nonexistent not found'
      );
    });
  });

  describe('getRunbookExecution', () => {
    it('should return execution by ID', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      const execution = await executeRunbook(runbook.id, 'user-1');

      const found = await getRunbookExecution(execution.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(execution.id);
    });

    it('should return null for non-existent execution', async () => {
      const found = await getRunbookExecution('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('listRunbookExecutions', () => {
    it('should list executions for a runbook', async () => {
      const runbook = await createRunbook(defaultRunbookParams);
      await executeRunbook(runbook.id, 'user-1');
      await executeRunbook(runbook.id, 'user-2');

      const executions = await listRunbookExecutions(runbook.id);

      expect(executions).toHaveLength(2);
      // Should be sorted by startedAt descending
      expect(executions[0].startedAt.getTime()).toBeGreaterThanOrEqual(
        executions[1].startedAt.getTime()
      );
    });

    it('should return empty for runbook with no executions', async () => {
      const executions = await listRunbookExecutions('nonexistent');
      expect(executions).toHaveLength(0);
    });
  });

  describe('createFromTemplate', () => {
    it('should create runbook from template index 0 (Weekly CFO Pack)', async () => {
      const runbook = await createFromTemplate(0, 'entity-1', 'user-1');

      expect(runbook.name).toBe('Weekly CFO Pack');
      expect(runbook.entityId).toBe('entity-1');
      expect(runbook.createdBy).toBe('user-1');
      expect(runbook.steps.length).toBe(BUILTIN_TEMPLATES[0].steps.length);
      expect(runbook.tags).toEqual(BUILTIN_TEMPLATES[0].tags);
    });

    it('should create runbook from template index 1 (Client Onboarding)', async () => {
      const runbook = await createFromTemplate(1, 'entity-1', 'user-1');

      expect(runbook.name).toBe('Client Onboarding');
      expect(runbook.steps.length).toBe(BUILTIN_TEMPLATES[1].steps.length);
    });

    it('should create runbook from template index 2 (Close the Loop Fridays)', async () => {
      const runbook = await createFromTemplate(2, 'entity-1', 'user-1');

      expect(runbook.name).toBe('Close the Loop Fridays');
      expect(runbook.schedule).toBe('0 9 * * 5');
    });

    it('should throw for invalid template index', async () => {
      await expect(
        createFromTemplate(99, 'entity-1', 'user-1')
      ).rejects.toThrow('Template index 99 not found');
    });
  });

  describe('describeCronExpression', () => {
    it('should describe weekly schedule', () => {
      // Monday at 9:00
      expect(describeCronExpression('0 9 * * 1')).toBe(
        'Every Monday at 9:00'
      );
    });

    it('should describe Friday schedule', () => {
      expect(describeCronExpression('0 9 * * 5')).toBe(
        'Every Friday at 9:00'
      );
    });

    it('should describe daily schedule', () => {
      expect(describeCronExpression('30 8 * * *')).toBe(
        'Daily at 8:30'
      );
    });

    it('should describe monthly schedule', () => {
      expect(describeCronExpression('0 10 15 * *')).toBe(
        'Day 15 of every month at 10:00'
      );
    });

    it('should return raw expression for invalid format', () => {
      expect(describeCronExpression('invalid')).toBe('invalid');
    });

    it('should pad minutes correctly', () => {
      expect(describeCronExpression('5 9 * * 1')).toBe(
        'Every Monday at 9:05'
      );
    });
  });

  describe('BUILTIN_TEMPLATES', () => {
    it('should have 3 built-in templates', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(3);
    });

    it('should have valid step structures', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.steps.length).toBeGreaterThan(0);
        expect(template.tags.length).toBeGreaterThan(0);

        for (const step of template.steps) {
          expect(step.order).toBeGreaterThan(0);
          expect(step.name).toBeDefined();
          expect(step.actionType).toBeDefined();
          expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(
            step.maxBlastRadius
          );
        }
      }
    });
  });
});
