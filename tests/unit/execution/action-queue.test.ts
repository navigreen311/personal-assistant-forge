// Mock uuid ESM module
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import {
  enqueueAction,
  approveAction,
  rejectAction,
  executeAction,
  getQueuedActions,
  getActionById,
  scheduleAction,
  bulkApprove,
  bulkReject,
  cancelAction,
  _clearActionStore,
  _getActionStore,
} from '../../../src/modules/execution/services/action-queue';
import { _clearGateStore, createGate } from '../../../src/modules/execution/services/execution-gate';

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

describe('ActionQueue', () => {
  beforeEach(() => {
    _clearActionStore();
    _clearGateStore();
  });

  const defaultParams = {
    actionLogId: '',
    actor: 'AI' as const,
    actorId: 'ai-agent-1',
    actionType: 'CREATE_TASK',
    target: 'tasks',
    description: 'Create a new task',
    reason: 'User requested task creation',
    impact: 'Low - creates a single task',
    rollbackPlan: 'Delete the created task',
    blastRadius: 'LOW' as const,
    reversible: true,
    requiresApproval: false,
    entityId: 'entity-1',
  };

  describe('enqueueAction', () => {
    it('should enqueue an action with generated ID and timestamps', async () => {
      const action = await enqueueAction(defaultParams);

      expect(action.id).toBeDefined();
      expect(action.actionLogId).toBe('action-log-mock-id');
      expect(action.actor).toBe('AI');
      expect(action.actionType).toBe('CREATE_TASK');
      expect(action.status).toBe('QUEUED');
      expect(action.createdAt).toBeInstanceOf(Date);
      expect(action.updatedAt).toBeInstanceOf(Date);
    });

    it('should auto-approve LOW blast radius in EXECUTE_AUTONOMOUS mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      expect(action.status).toBe('APPROVED');
      expect(action.requiresApproval).toBe(false);
    });

    it('should keep QUEUED for HIGH blast radius in EXECUTE_AUTONOMOUS mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'HIGH', requiresApproval: true },
        'EXECUTE_AUTONOMOUS'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should keep QUEUED in SUGGEST mode regardless of blast radius', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: true },
        'SUGGEST'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should keep QUEUED in DRAFT mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: true },
        'DRAFT'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should keep QUEUED in EXECUTE_WITH_APPROVAL mode', async () => {
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: true },
        'EXECUTE_WITH_APPROVAL'
      );

      expect(action.status).toBe('QUEUED');
      expect(action.requiresApproval).toBe(true);
    });

    it('should respect explicit requiresApproval=true override', async () => {
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: true, blastRadius: 'LOW' },
        'EXECUTE_AUTONOMOUS'
      );

      // explicitRequirement=true overrides auto-approval logic
      expect(action.requiresApproval).toBe(true);
      expect(action.status).toBe('QUEUED');
    });

    it('should store the action in the action store', async () => {
      const action = await enqueueAction(defaultParams);
      const store = _getActionStore();

      expect(store.has(action.id)).toBe(true);
      expect(store.get(action.id)).toEqual(action);
    });

    it('should use explicit requiresApproval=false as override', async () => {
      // When requiresApproval is explicitly false, it takes precedence over autonomy level
      const action = await enqueueAction(
        { ...defaultParams, requiresApproval: false },
        'EXECUTE_WITH_APPROVAL'
      );

      expect(action.requiresApproval).toBe(false);
    });
  });

  describe('approveAction', () => {
    it('should approve a QUEUED action', async () => {
      const action = await enqueueAction(defaultParams, 'SUGGEST');
      const approved = await approveAction(action.id, 'approver-1');

      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe('approver-1');
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent action', async () => {
      await expect(approveAction('nonexistent', 'approver-1')).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when approving non-QUEUED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      // Action is already APPROVED
      await expect(approveAction(action.id, 'approver-1')).rejects.toThrow(
        'Cannot approve action with status APPROVED'
      );
    });
  });

  describe('rejectAction', () => {
    it('should reject a QUEUED action', async () => {
      const action = await enqueueAction(defaultParams, 'SUGGEST');
      const rejected = await rejectAction(action.id, 'Not needed');

      expect(rejected.status).toBe('REJECTED');
    });

    it('should throw for non-existent action', async () => {
      await expect(rejectAction('nonexistent', 'reason')).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when rejecting non-QUEUED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      await expect(rejectAction(action.id, 'reason')).rejects.toThrow(
        'Cannot reject action with status APPROVED'
      );
    });
  });

  describe('executeAction', () => {
    it('should execute an APPROVED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      const executed = await executeAction(action.id);

      expect(executed.status).toBe('EXECUTED');
      expect(executed.executedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent action', async () => {
      await expect(executeAction('nonexistent')).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when executing non-APPROVED action', async () => {
      const action = await enqueueAction(defaultParams, 'SUGGEST');

      await expect(executeAction(action.id)).rejects.toThrow(
        'Cannot execute action with status QUEUED'
      );
    });

    it('should block execution when a gate fails', async () => {
      createGate({
        name: 'Block All',
        expression: 'false',
        description: 'Block everything',
        scope: 'GLOBAL',
        isActive: true,
      });

      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      await expect(executeAction(action.id)).rejects.toThrow(
        'Execution blocked by gate'
      );

      // Action should be marked FAILED
      const stored = _getActionStore().get(action.id);
      expect(stored!.status).toBe('FAILED');
    });
  });

  describe('getQueuedActions', () => {
    it('should return all actions with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await enqueueAction(
          { ...defaultParams, description: `Task ${i}` },
          'SUGGEST'
        );
      }

      const result = await getQueuedActions({}, 1, 3);

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(3);
    });

    it('should filter by status', async () => {
      await enqueueAction(defaultParams, 'SUGGEST'); // QUEUED
      await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      ); // APPROVED

      const queued = await getQueuedActions({ status: 'QUEUED' });
      expect(queued.data).toHaveLength(1);
      expect(queued.data[0].status).toBe('QUEUED');

      const approved = await getQueuedActions({ status: 'APPROVED' });
      expect(approved.data).toHaveLength(1);
      expect(approved.data[0].status).toBe('APPROVED');
    });

    it('should filter by actor', async () => {
      await enqueueAction({ ...defaultParams, actor: 'AI' }, 'SUGGEST');
      await enqueueAction({ ...defaultParams, actor: 'HUMAN' }, 'SUGGEST');

      const aiActions = await getQueuedActions({ actor: 'AI' });
      expect(aiActions.data).toHaveLength(1);
      expect(aiActions.data[0].actor).toBe('AI');
    });

    it('should filter by blastRadius', async () => {
      await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW' },
        'SUGGEST'
      );
      await enqueueAction(
        { ...defaultParams, blastRadius: 'HIGH' },
        'SUGGEST'
      );

      const high = await getQueuedActions({ blastRadius: 'HIGH' });
      expect(high.data).toHaveLength(1);
      expect(high.data[0].blastRadius).toBe('HIGH');
    });

    it('should filter by entityId', async () => {
      await enqueueAction(
        { ...defaultParams, entityId: 'entity-1' },
        'SUGGEST'
      );
      await enqueueAction(
        { ...defaultParams, entityId: 'entity-2' },
        'SUGGEST'
      );

      const result = await getQueuedActions({ entityId: 'entity-1' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].entityId).toBe('entity-1');
    });

    it('should sort by creation time descending', async () => {
      const a1 = await enqueueAction(
        { ...defaultParams, description: 'First' },
        'SUGGEST'
      );
      // Manually adjust createdAt to ensure different timestamps
      a1.createdAt = new Date('2026-01-01T00:00:00Z');
      _getActionStore().set(a1.id, a1);

      const a2 = await enqueueAction(
        { ...defaultParams, description: 'Second' },
        'SUGGEST'
      );
      a2.createdAt = new Date('2026-01-02T00:00:00Z');
      _getActionStore().set(a2.id, a2);

      const result = await getQueuedActions({});
      expect(result.data[0].description).toBe('Second');
      expect(result.data[1].description).toBe('First');
    });

    it('should return empty for no matches', async () => {
      const result = await getQueuedActions({ status: 'EXECUTED' });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getActionById', () => {
    it('should return action by ID', async () => {
      const action = await enqueueAction(defaultParams, 'SUGGEST');
      const found = await getActionById(action.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(action.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await getActionById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('scheduleAction', () => {
    it('should set scheduledFor date on action', async () => {
      const action = await enqueueAction(defaultParams, 'SUGGEST');
      const futureDate = new Date('2026-12-31T00:00:00Z');

      const scheduled = await scheduleAction(action.id, futureDate);

      expect(scheduled.scheduledFor).toEqual(futureDate);
      expect(scheduled.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent action', async () => {
      await expect(
        scheduleAction('nonexistent', new Date())
      ).rejects.toThrow('Action nonexistent not found');
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple QUEUED actions', async () => {
      const a1 = await enqueueAction(defaultParams, 'SUGGEST');
      const a2 = await enqueueAction(defaultParams, 'SUGGEST');

      const result = await bulkApprove([a1.id, a2.id], 'approver-1');

      expect(result.approved).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should count failures for non-QUEUED actions', async () => {
      const queued = await enqueueAction(defaultParams, 'SUGGEST');
      const autoApproved = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      const result = await bulkApprove(
        [queued.id, autoApproved.id],
        'approver-1'
      );

      expect(result.approved).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('bulkReject', () => {
    it('should reject multiple QUEUED actions', async () => {
      const a1 = await enqueueAction(defaultParams, 'SUGGEST');
      const a2 = await enqueueAction(defaultParams, 'SUGGEST');

      const result = await bulkReject([a1.id, a2.id], 'Batch rejection');

      expect(result.rejected).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should count failures for non-QUEUED actions', async () => {
      const queued = await enqueueAction(defaultParams, 'SUGGEST');
      const autoApproved = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      const result = await bulkReject(
        [queued.id, autoApproved.id],
        'Batch rejection'
      );

      expect(result.rejected).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('cancelAction', () => {
    it('should cancel a QUEUED action', async () => {
      const action = await enqueueAction(defaultParams, 'SUGGEST');
      const cancelled = await cancelAction(action.id);

      expect(cancelled.status).toBe('REJECTED');
    });

    it('should throw for non-existent action', async () => {
      await expect(cancelAction('nonexistent')).rejects.toThrow(
        'Action nonexistent not found'
      );
    });

    it('should throw when cancelling non-QUEUED action', async () => {
      const action = await enqueueAction(
        { ...defaultParams, blastRadius: 'LOW', requiresApproval: false },
        'EXECUTE_AUTONOMOUS'
      );

      await expect(cancelAction(action.id)).rejects.toThrow(
        'Cannot cancel action with status APPROVED'
      );
    });
  });
});
