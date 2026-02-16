// ============================================================================
// Action Handlers — Unit Tests
// ============================================================================

import {
  handleCreateTask,
  handleSendMessage,
  handleCallAPI,
  executeAction,
} from '@/modules/workflows/services/action-handlers';

// --- Mocks ---

// Mock AI client — reject so we fall back to non-AI action handling
const mockGenerateJSON = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      create: jest.fn().mockResolvedValue({
        id: 'task-1',
        title: 'Test Task',
        entityId: 'entity-1',
        priority: 'P1',
        status: 'TODO',
      }),
    },
    message: {
      create: jest.fn().mockResolvedValue({
        id: 'msg-1',
        channel: 'EMAIL',
        body: 'Test body',
      }),
    },
    actionLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  },
}));

const { prisma } = jest.requireMock('@/lib/db');

describe('ActionHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCreateTask', () => {
    it('should create a task with provided parameters', async () => {
      const result = await handleCreateTask({
        title: 'New Task',
        entityId: 'entity-1',
        priority: 'P0',
      });

      expect(result.taskId).toBe('task-1');
      expect(result.title).toBe('New Task');
      expect(result.status).toBe('TODO');
    });

    it('should validate required parameters (title, entityId)', async () => {
      await expect(handleCreateTask({ title: '' })).rejects.toThrow();
      await expect(handleCreateTask({ entityId: 'entity-1' })).rejects.toThrow();
    });

    it('should log action to ActionLog', async () => {
      await handleCreateTask({
        title: 'Logged Task',
        entityId: 'entity-1',
      });

      expect(prisma.actionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'CREATE_TASK',
            status: 'EXECUTED',
          }),
        })
      );
    });

    it('should return created task data', async () => {
      const result = await handleCreateTask({
        title: 'Data Task',
        entityId: 'entity-1',
      });

      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('status');
    });
  });

  describe('handleSendMessage', () => {
    it('should create a message record', async () => {
      const result = await handleSendMessage({
        channel: 'EMAIL',
        recipientId: 'user-2',
        entityId: 'entity-1',
        body: 'Hello world',
      });

      expect(result.messageId).toBe('msg-1');
      expect(result.status).toBe('SENT');
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('should validate channel and recipient', async () => {
      await expect(
        handleSendMessage({
          channel: '',
          recipientId: 'user-2',
          entityId: 'entity-1',
          body: 'Hello',
        })
      ).rejects.toThrow();

      await expect(
        handleSendMessage({
          channel: 'EMAIL',
          recipientId: '',
          entityId: 'entity-1',
          body: 'Hello',
        })
      ).rejects.toThrow();
    });
  });

  describe('handleCallAPI', () => {
    it('should make HTTP request with provided params', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue('{"data": "test"}'),
      });
      global.fetch = mockFetch;

      const result = await handleCallAPI({
        url: 'https://api.example.com/test',
        method: 'GET',
      });

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should timeout after configured duration', async () => {
      const mockFetch = jest.fn().mockImplementation(
        () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Aborted')), 100);
        })
      );
      global.fetch = mockFetch;

      await expect(
        handleCallAPI({
          url: 'https://api.example.com/slow',
          method: 'GET',
          timeout: 50,
        })
      ).rejects.toThrow();
    });

    it('should return response data', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue('{"result": "success"}'),
      });
      global.fetch = mockFetch;

      const result = await handleCallAPI({
        url: 'https://api.example.com/data',
        method: 'POST',
        body: { key: 'value' },
      });

      expect(result.data).toEqual({ result: 'success' });
    });
  });

  describe('executeAction', () => {
    it('should dispatch to the correct handler based on action type', async () => {
      const result = await executeAction('CREATE_TASK', {
        title: 'Dispatch Test',
        entityId: 'entity-1',
      });

      expect(result.taskId).toBeDefined();
    });

    it('should throw for unknown action types', async () => {
      await expect(
        executeAction('UNKNOWN_TYPE' as never, {})
      ).rejects.toThrow('No handler registered');
    });
  });
});
