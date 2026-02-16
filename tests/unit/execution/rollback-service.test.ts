// Mock uuid ESM module
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${Math.random().toString(36).slice(2)}`,
}));

import {
  createRollbackPlan,
  executeRollback,
  getRollbackPlan,
  canRollback,
  _clearRollbackStore,
} from '../../../src/modules/execution/services/rollback-service';
import {
  _clearActionStore,
  _getActionStore,
} from '../../../src/modules/execution/services/action-queue';
import type { QueuedAction } from '../../../src/modules/execution/types';

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

function seedAction(overrides: Partial<QueuedAction> = {}): QueuedAction {
  const action: QueuedAction = {
    id: 'action-1',
    actionLogId: 'log-1',
    actor: 'AI',
    actionType: 'CREATE_TASK',
    target: 'tasks/t-1',
    description: 'Create task',
    reason: 'Testing',
    impact: 'Low',
    rollbackPlan: 'Delete the task',
    blastRadius: 'LOW',
    reversible: true,
    status: 'EXECUTED',
    requiresApproval: false,
    entityId: 'entity-1',
    executedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  _getActionStore().set(action.id, action);
  return action;
}

describe('RollbackService', () => {
  beforeEach(() => {
    _clearActionStore();
    _clearRollbackStore();
  });

  describe('createRollbackPlan', () => {
    it('should create rollback plan for CREATE_TASK', async () => {
      seedAction({ actionType: 'CREATE_TASK', target: 'tasks/t-1' });

      const plan = await createRollbackPlan('action-1');

      expect(plan.actionId).toBe('action-1');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Task');
      expect(plan.steps[0].recordId).toBe('tasks/t-1');
      expect(plan.steps[0].status).toBe('PENDING');
      expect(plan.canAutoRollback).toBe(true);
      expect(plan.requiresManualSteps).toBe(false);
      expect(plan.estimatedDuration).toBe(1000);
    });

    it('should create rollback plan for CREATE_CONTACT', async () => {
      seedAction({
        id: 'action-2',
        actionType: 'CREATE_CONTACT',
        target: 'contacts/c-1',
      });

      const plan = await createRollbackPlan('action-2');

      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Contact');
      expect(plan.canAutoRollback).toBe(true);
    });

    it('should create rollback plan for CREATE_PROJECT', async () => {
      seedAction({
        id: 'action-3',
        actionType: 'CREATE_PROJECT',
        target: 'projects/p-1',
      });

      const plan = await createRollbackPlan('action-3');

      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Project');
    });

    it('should create rollback plan for UPDATE_RECORD with RESTORE step', async () => {
      seedAction({ id: 'action-4', actionType: 'UPDATE_RECORD', target: 'records/r-1' });

      const plan = await createRollbackPlan('action-4');

      expect(plan.steps[0].type).toBe('RESTORE');
      expect(plan.steps[0].model).toBe('Record');
      expect(plan.canAutoRollback).toBe(true);
    });

    it('should create rollback plan for DELETE_RECORD with RESTORE step', async () => {
      seedAction({ id: 'action-5', actionType: 'DELETE_RECORD', target: 'records/r-1' });

      const plan = await createRollbackPlan('action-5');

      expect(plan.steps[0].type).toBe('RESTORE');
    });

    it('should create rollback plan for SEND_MESSAGE with UNDO_SEND and MANUAL steps', async () => {
      seedAction({ id: 'action-6', actionType: 'SEND_MESSAGE', target: 'messages/m-1' });

      const plan = await createRollbackPlan('action-6');

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].type).toBe('UNDO_SEND');
      expect(plan.steps[1].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
      expect(plan.requiresManualSteps).toBe(true);
      expect(plan.manualInstructions).toBeDefined();
      expect(plan.manualInstructions).toContain('Manually contact recipient');
    });

    it('should create rollback plan for FINANCIAL_ACTION with UPDATE and MANUAL steps', async () => {
      seedAction({
        id: 'action-7',
        actionType: 'FINANCIAL_ACTION',
        target: 'finance/f-1',
      });

      const plan = await createRollbackPlan('action-7');

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].type).toBe('UPDATE');
      expect(plan.steps[0].model).toBe('FinancialRecord');
      expect(plan.steps[1].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
      expect(plan.requiresManualSteps).toBe(true);
    });

    it('should create rollback plan for TRIGGER_WORKFLOW with MANUAL step', async () => {
      seedAction({
        id: 'action-8',
        actionType: 'TRIGGER_WORKFLOW',
        target: 'workflows/wf-1',
      });

      const plan = await createRollbackPlan('action-8');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
    });

    it('should create rollback plan for CALL_API with MANUAL step', async () => {
      seedAction({
        id: 'action-9',
        actionType: 'CALL_API',
        target: 'api/endpoint',
      });

      const plan = await createRollbackPlan('action-9');

      expect(plan.steps[0].type).toBe('MANUAL');
      expect(plan.canAutoRollback).toBe(false);
    });

    it('should create rollback plan for GENERATE_DOCUMENT with DELETE step', async () => {
      seedAction({
        id: 'action-10',
        actionType: 'GENERATE_DOCUMENT',
        target: 'documents/d-1',
      });

      const plan = await createRollbackPlan('action-10');

      expect(plan.steps[0].type).toBe('DELETE');
      expect(plan.steps[0].model).toBe('Document');
      expect(plan.canAutoRollback).toBe(true);
    });

    it('should create generic MANUAL rollback for unknown action types', async () => {
      seedAction({
        id: 'action-11',
        actionType: 'CUSTOM_ACTION',
        target: 'custom/resource',
      });

      const plan = await createRollbackPlan('action-11');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('MANUAL');
      expect(plan.steps[0].description).toContain('Manually reverse');
      expect(plan.canAutoRollback).toBe(false);
    });

    it('should throw for non-existent action', async () => {
      await expect(createRollbackPlan('nonexistent')).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should store the plan in the rollback store', async () => {
      seedAction();
      await createRollbackPlan('action-1');

      const stored = await getRollbackPlan('action-1');
      expect(stored).toBeDefined();
      expect(stored!.actionId).toBe('action-1');
    });
  });

  describe('executeRollback', () => {
    it('should execute auto-rollback for CREATE_TASK (DELETE step)', async () => {
      seedAction({
        actionType: 'CREATE_TASK',
        target: 'tasks/t-1',
      });

      const result = await executeRollback('action-1');

      expect(result.actionId).toBe('action-1');
      expect(result.status).toBe('COMPLETE');
      expect(result.stepsCompleted).toBe(1);
      expect(result.stepsFailed).toBe(0);
      expect(result.stepsSkipped).toBe(0);

      // Action should be marked ROLLED_BACK
      const action = _getActionStore().get('action-1');
      expect(action!.status).toBe('ROLLED_BACK');
    });

    it('should skip MANUAL steps and report as PARTIAL', async () => {
      seedAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages/m-1',
      });

      const result = await executeRollback('action-1');

      // SEND_MESSAGE has UNDO_SEND (completed) + MANUAL (skipped)
      expect(result.stepsCompleted).toBe(1);
      expect(result.stepsSkipped).toBe(1);
      expect(result.status).toBe('PARTIAL');
    });

    it('should create a plan automatically if none exists', async () => {
      seedAction({
        actionType: 'CREATE_CONTACT',
        target: 'contacts/c-1',
      });

      // Don't call createRollbackPlan first
      const result = await executeRollback('action-1');

      expect(result.status).toBe('COMPLETE');
      expect(result.stepsCompleted).toBe(1);
    });

    it('should use existing plan if already created', async () => {
      seedAction({
        actionType: 'CREATE_TASK',
        target: 'tasks/t-1',
      });

      await createRollbackPlan('action-1');
      const result = await executeRollback('action-1');

      expect(result.status).toBe('COMPLETE');
    });

    it('should handle RESTORE step for UPDATE_RECORD', async () => {
      seedAction({
        actionType: 'UPDATE_RECORD',
        target: 'records/r-1',
      });

      // The default strategy passes empty previousState {}
      // RESTORE requires model, recordId, and previousState to be truthy
      // Since previousState is {}, it's truthy but empty object = falsy-ish?
      // Actually {} is truthy in JS. But the rollback strategy passes {} for previousState
      // The code checks: step.model && step.recordId && step.previousState
      // model = 'Record', recordId = 'records/r-1', previousState = {} -> all truthy
      const result = await executeRollback('action-1');

      expect(result.stepsCompleted).toBe(1);
      expect(result.status).toBe('COMPLETE');
    });

    it('should report FAILED when all steps fail or skip with no completions', async () => {
      seedAction({
        actionType: 'CALL_API',
        target: 'api/endpoint',
      });

      // CALL_API has only a MANUAL step -> skipped
      const result = await executeRollback('action-1');

      expect(result.stepsSkipped).toBe(1);
      expect(result.stepsCompleted).toBe(0);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('getRollbackPlan', () => {
    it('should return stored plan', async () => {
      seedAction();
      await createRollbackPlan('action-1');

      const plan = await getRollbackPlan('action-1');
      expect(plan).toBeDefined();
      expect(plan!.actionId).toBe('action-1');
    });

    it('should return null if no plan exists', async () => {
      const plan = await getRollbackPlan('nonexistent');
      expect(plan).toBeNull();
    });
  });

  describe('canRollback', () => {
    it('should return true for EXECUTED reversible action', async () => {
      seedAction({
        status: 'EXECUTED',
        reversible: true,
      });

      const result = await canRollback('action-1');
      expect(result.canRollback).toBe(true);
    });

    it('should return false for already rolled back action', async () => {
      seedAction({ status: 'ROLLED_BACK' });

      const result = await canRollback('action-1');
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('already been rolled back');
    });

    it('should return false for non-EXECUTED action', async () => {
      seedAction({ status: 'QUEUED' });

      const result = await canRollback('action-1');
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('status QUEUED');
    });

    it('should return false for irreversible action', async () => {
      seedAction({ status: 'EXECUTED', reversible: false });

      const result = await canRollback('action-1');
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('irreversible');
    });

    it('should return false for non-existent action', async () => {
      const result = await canRollback('nonexistent');
      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });
});
