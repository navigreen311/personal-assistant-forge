import {
  logExecution,
  logStepResult,
  getExecutionLog,
  rollbackExecution,
} from '@/modules/workflows/services/execution-logger';
import type { WorkflowExecution, StepExecutionResult } from '@/modules/workflows/types';

// --- Mocks ---

const mockActionLogCreate = jest.fn();
const mockActionLogFindMany = jest.fn();
const mockActionLogUpdate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      create: (...args: unknown[]) => mockActionLogCreate(...args),
      findMany: (...args: unknown[]) => mockActionLogFindMany(...args),
      update: (...args: unknown[]) => mockActionLogUpdate(...args),
    },
  },
}));

// --- Tests ---

describe('ExecutionLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logExecution', () => {
    it('should log a completed workflow execution', async () => {
      const execution: WorkflowExecution = {
        id: 'exec-1',
        workflowId: 'wf-1',
        status: 'COMPLETED',
        triggeredBy: 'user-1',
        triggerType: 'MANUAL',
        startedAt: new Date(),
        completedAt: new Date(),
        variables: {},
        stepResults: [
          { nodeId: 'node-1', status: 'COMPLETED', startedAt: new Date(), completedAt: new Date(), input: {}, output: {}, retryCount: 0 },
          { nodeId: 'node-2', status: 'COMPLETED', startedAt: new Date(), completedAt: new Date(), input: {}, output: {}, retryCount: 0 },
        ],
      };

      mockActionLogCreate.mockResolvedValue({ id: 'log-1' });

      await logExecution(execution);

      expect(mockActionLogCreate).toHaveBeenCalledTimes(1);
      const callData = mockActionLogCreate.mock.calls[0][0].data;
      expect(callData.actor).toBe('HUMAN');
      expect(callData.actorId).toBe('user-1');
      expect(callData.actionType).toBe('WORKFLOW_EXECUTION');
      expect(callData.target).toBe('workflow:wf-1/execution:exec-1');
      expect(callData.status).toBe('EXECUTED');
      expect(callData.blastRadius).toBe('MEDIUM');
      expect(callData.reversible).toBe(true);

      // Verify rollbackPath contains step nodeIds
      const rollbackPath = JSON.parse(callData.rollbackPath);
      expect(rollbackPath.executionId).toBe('exec-1');
      expect(rollbackPath.steps).toEqual(['node-1', 'node-2']);
    });

    it('should log system-triggered execution with SYSTEM actor', async () => {
      const execution: WorkflowExecution = {
        id: 'exec-2',
        workflowId: 'wf-2',
        status: 'FAILED',
        triggeredBy: 'SYSTEM',
        triggerType: 'EVENT',
        startedAt: new Date(),
        variables: {},
        stepResults: [],
        error: 'Connection timeout',
      };

      mockActionLogCreate.mockResolvedValue({ id: 'log-2' });

      await logExecution(execution);

      const callData = mockActionLogCreate.mock.calls[0][0].data;
      expect(callData.actor).toBe('SYSTEM');
      expect(callData.actorId).toBeUndefined();
      expect(callData.status).toBe('FAILED');
      expect(callData.reason).toContain('FAILED');
      expect(callData.reason).toContain('EVENT');
    });
  });

  describe('logStepResult', () => {
    it('should log a completed step with rollback info', async () => {
      const result: StepExecutionResult = {
        nodeId: 'action-node-1',
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        input: { taskTitle: 'Test' },
        output: { taskId: 'created-task-1' },
        retryCount: 0,
      };

      mockActionLogCreate.mockResolvedValue({ id: 'step-log-1' });

      await logStepResult('exec-1', result);

      expect(mockActionLogCreate).toHaveBeenCalledTimes(1);
      const callData = mockActionLogCreate.mock.calls[0][0].data;
      expect(callData.actor).toBe('SYSTEM');
      expect(callData.actionType).toBe('WORKFLOW_STEP_COMPLETED');
      expect(callData.target).toBe('execution:exec-1/node:action-node-1');
      expect(callData.reversible).toBe(true);
      expect(callData.status).toBe('EXECUTED');

      const rollbackPath = JSON.parse(callData.rollbackPath);
      expect(rollbackPath.executionId).toBe('exec-1');
      expect(rollbackPath.nodeId).toBe('action-node-1');
    });

    it('should log a failed step without rollback path', async () => {
      const result: StepExecutionResult = {
        nodeId: 'action-node-2',
        status: 'FAILED',
        startedAt: new Date(),
        completedAt: new Date(),
        input: {},
        output: {},
        error: 'API timeout',
        retryCount: 3,
      };

      mockActionLogCreate.mockResolvedValue({ id: 'step-log-2' });

      await logStepResult('exec-2', result);

      const callData = mockActionLogCreate.mock.calls[0][0].data;
      expect(callData.actionType).toBe('WORKFLOW_STEP_FAILED');
      expect(callData.reason).toContain('FAILED');
      expect(callData.reason).toContain('API timeout');
      expect(callData.reversible).toBe(false);
      expect(callData.rollbackPath).toBeUndefined();
      expect(callData.status).toBe('FAILED');
    });
  });

  describe('getExecutionLog', () => {
    it('should return all logs for an execution ordered by timestamp', async () => {
      const logs = [
        {
          id: 'log-1',
          actor: 'HUMAN',
          actorId: 'user-1',
          actionType: 'WORKFLOW_EXECUTION',
          target: 'workflow:wf-1/execution:exec-1',
          reason: 'Workflow execution COMPLETED (trigger: MANUAL)',
          blastRadius: 'MEDIUM',
          reversible: true,
          rollbackPath: '{}',
          status: 'EXECUTED',
          cost: null,
          timestamp: new Date('2025-01-01T10:00:00Z'),
        },
        {
          id: 'log-2',
          actor: 'SYSTEM',
          actorId: null,
          actionType: 'WORKFLOW_STEP_COMPLETED',
          target: 'execution:exec-1/node:node-1',
          reason: 'Step COMPLETED',
          blastRadius: 'LOW',
          reversible: true,
          rollbackPath: '{}',
          status: 'EXECUTED',
          cost: null,
          timestamp: new Date('2025-01-01T10:00:01Z'),
        },
      ];

      mockActionLogFindMany.mockResolvedValue(logs);

      const result = await getExecutionLog('exec-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('log-1');
      expect(result[1].id).toBe('log-2');
      expect(mockActionLogFindMany).toHaveBeenCalledWith({
        where: { target: { contains: 'execution:exec-1' } },
        orderBy: { timestamp: 'asc' },
      });
    });

    it('should return empty array when no logs exist for execution', async () => {
      mockActionLogFindMany.mockResolvedValue([]);

      const result = await getExecutionLog('exec-nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('rollbackExecution', () => {
    it('should rollback reversible executed steps in reverse order', async () => {
      const logs = [
        {
          id: 'log-2',
          target: 'execution:exec-1/node:node-2',
          status: 'EXECUTED',
          reversible: true,
          rollbackPath: JSON.stringify({ executionId: 'exec-1', nodeId: 'node-2', output: { taskId: 't2' } }),
          reason: 'Step COMPLETED',
          blastRadius: 'LOW',
        },
        {
          id: 'log-1',
          target: 'execution:exec-1/node:node-1',
          status: 'EXECUTED',
          reversible: true,
          rollbackPath: JSON.stringify({ executionId: 'exec-1', nodeId: 'node-1', output: { taskId: 't1' } }),
          reason: 'Step COMPLETED',
          blastRadius: 'LOW',
        },
      ];

      mockActionLogFindMany.mockResolvedValue(logs);
      mockActionLogUpdate.mockResolvedValue({});
      mockActionLogCreate.mockResolvedValue({ id: 'rollback-log' });

      const result = await rollbackExecution('exec-1');

      expect(result.rolledBack).toHaveLength(2);
      expect(result.failed).toHaveLength(0);

      // Each log should be updated to ROLLED_BACK and a rollback log created
      expect(mockActionLogUpdate).toHaveBeenCalledTimes(2);
      expect(mockActionLogCreate).toHaveBeenCalledTimes(2);

      // Verify the first update marked the log as ROLLED_BACK
      expect(mockActionLogUpdate.mock.calls[0][0]).toEqual({
        where: { id: 'log-2' },
        data: { status: 'ROLLED_BACK' },
      });

      // Verify rollback log entries
      const firstRollbackLog = mockActionLogCreate.mock.calls[0][0].data;
      expect(firstRollbackLog.actionType).toBe('WORKFLOW_ROLLBACK');
      expect(firstRollbackLog.reversible).toBe(false);
      expect(firstRollbackLog.status).toBe('EXECUTED');
    });

    it('should handle rollback failures gracefully', async () => {
      const logs = [
        {
          id: 'log-fail',
          target: 'execution:exec-1/node:node-fail',
          status: 'EXECUTED',
          reversible: true,
          rollbackPath: JSON.stringify({ executionId: 'exec-1', nodeId: 'node-fail' }),
          reason: 'Step COMPLETED',
          blastRadius: 'LOW',
        },
      ];

      mockActionLogFindMany.mockResolvedValue(logs);
      mockActionLogUpdate.mockRejectedValue(new Error('DB connection failed'));

      const result = await rollbackExecution('exec-1');

      expect(result.rolledBack).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].status).toBe('FAILED');
      expect(result.failed[0].error).toBe('DB connection failed');
    });
  });
});
