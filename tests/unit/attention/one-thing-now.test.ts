jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: jest.fn().mockResolvedValue({ id: 'task-1', title: 'DB Task Title', status: 'IN_PROGRESS', priority: 'HIGH' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', preferences: {} }),
      update: jest.fn().mockResolvedValue({}),
    },
    actionLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import {
  activate,
  deactivate,
  getState,
  setFocusTask,
  getFocusTask,
  clearFocusTask,
  getFocusStats,
  shouldInterrupt,
  otnStore,
} from '@/modules/attention/services/one-thing-now-service';

const { prisma } = require('@/lib/db');

describe('OneThingNowService', () => {
  beforeEach(() => {
    otnStore.clear();
    jest.clearAllMocks();
  });

  describe('activate', () => {
    it('should set focus mode with the given task and default 60-minute session', async () => {
      const state = await activate('user-1', 'task-1');

      expect(state.userId).toBe('user-1');
      expect(state.isActive).toBe(true);
      expect(state.currentTask).toBeDefined();
      expect(state.currentTask!.taskId).toBe('task-1');
      expect(state.currentTask!.title).toBe('Task task-1');
      expect(state.currentTask!.startedAt).toBeInstanceOf(Date);
      expect(state.sessionDuration).toBe(60);
      expect(state.blockedNotifications).toBe(0);
    });

    it('should accept a custom session duration', async () => {
      const state = await activate('user-1', 'task-1', 120);

      expect(state.sessionDuration).toBe(120);
    });

    it('should store the state in otnStore', async () => {
      await activate('user-1', 'task-1');

      expect(otnStore.has('user-1')).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('should deactivate focus mode and clear current task', async () => {
      await activate('user-1', 'task-1');
      const state = await deactivate('user-1');

      expect(state.isActive).toBe(false);
      expect(state.currentTask).toBeUndefined();
    });

    it('should return inactive state for user who was never activated', async () => {
      const state = await deactivate('user-never-activated');

      expect(state.isActive).toBe(false);
      expect(state.currentTask).toBeUndefined();
      expect(state.blockedNotifications).toBe(0);
    });
  });

  describe('getState', () => {
    it('should return current focus task details when active', async () => {
      await activate('user-1', 'task-1');

      const state = await getState('user-1');

      expect(state.isActive).toBe(true);
      expect(state.currentTask).toBeDefined();
      expect(state.currentTask!.taskId).toBe('task-1');
    });

    it('should return inactive default state when no focus task set', async () => {
      const state = await getState('user-nonexistent');

      expect(state.userId).toBe('user-nonexistent');
      expect(state.isActive).toBe(false);
      expect(state.currentTask).toBeUndefined();
      expect(state.blockedNotifications).toBe(0);
      expect(state.sessionDuration).toBe(0);
    });

    it('should reflect deactivated state after deactivation', async () => {
      await activate('user-1', 'task-1');
      await deactivate('user-1');

      const state = await getState('user-1');

      expect(state.isActive).toBe(false);
      expect(state.currentTask).toBeUndefined();
    });
  });

  describe('setFocusTask', () => {
    it('should activate focus mode and look up task title from DB', async () => {
      const state = await setFocusTask('user-1', 'task-1');

      expect(state.isActive).toBe(true);
      expect(state.currentTask).toBeDefined();
      expect(state.currentTask!.taskId).toBe('task-1');
      expect(state.currentTask!.title).toBe('DB Task Title');
    });

    it('should persist focus mode to user preferences', async () => {
      await setFocusTask('user-1', 'task-1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            preferences: expect.objectContaining({
              focusMode: expect.objectContaining({
                taskId: 'task-1',
                suppressNonUrgent: true,
              }),
            }),
          }),
        })
      );
    });

    it('should use fallback title when task not found in DB', async () => {
      (prisma.task.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const state = await setFocusTask('user-1', 'task-xyz');

      expect(state.currentTask!.title).toBe('Task task-xyz');
    });

    it('should handle DB errors gracefully and still activate', async () => {
      (prisma.task.findUnique as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const state = await setFocusTask('user-1', 'task-1');

      expect(state.isActive).toBe(true);
      expect(state.currentTask!.taskId).toBe('task-1');
    });
  });

  describe('getFocusTask', () => {
    it('should return active state with task details from DB', async () => {
      await activate('user-1', 'task-1');

      const result = await getFocusTask('user-1');

      expect(result.isActive).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task!.id).toBe('task-1');
      expect(result.task!.title).toBe('DB Task Title');
      expect(result.task!.status).toBe('IN_PROGRESS');
      expect(result.task!.priority).toBe('HIGH');
    });

    it('should return null task when no focus is active', async () => {
      const result = await getFocusTask('user-nonexistent');

      expect(result.isActive).toBe(false);
      expect(result.task).toBeNull();
    });

    it('should return state without task details when DB lookup fails', async () => {
      await activate('user-1', 'task-1');
      (prisma.task.findUnique as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const result = await getFocusTask('user-1');

      expect(result.isActive).toBe(true);
      expect(result.task).toBeNull();
    });
  });

  describe('clearFocusTask', () => {
    it('should deactivate focus and log session duration to ActionLog', async () => {
      await activate('user-1', 'task-1');

      const state = await clearFocusTask('user-1');

      expect(state.isActive).toBe(false);
      expect(state.currentTask).toBeUndefined();
      expect(prisma.actionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'user-1',
            actionType: 'FOCUS_SESSION',
            target: 'task-1',
            reason: expect.stringContaining('Focus session'),
          }),
        })
      );
    });

    it('should clear focusMode from user preferences', async () => {
      await activate('user-1', 'task-1');

      await clearFocusTask('user-1');

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should handle clearing when no focus was active without errors', async () => {
      const state = await clearFocusTask('user-never-focused');

      expect(state.isActive).toBe(false);
      expect(prisma.actionLog.create).not.toHaveBeenCalled();
    });

    it('should not throw when ActionLog write fails', async () => {
      await activate('user-1', 'task-1');
      (prisma.actionLog.create as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      await expect(clearFocusTask('user-1')).resolves.not.toThrow();
    });
  });

  describe('getFocusStats', () => {
    it('should return stats from ActionLog focus session records', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([
        { reason: 'Focus session on "Task A" lasted 45 minutes', status: 'COMPLETED' },
        { reason: 'Focus session on "Task B" lasted 30 minutes', status: 'COMPLETED' },
        { reason: 'Focus session on "Task C" lasted 60 minutes', status: 'COMPLETED' },
      ]);

      const stats = await getFocusStats('user-1');

      expect(stats.totalSessions).toBe(3);
      expect(stats.avgDurationMinutes).toBe(45);
      expect(stats.completedDuringFocus).toBe(3);
    });

    it('should return zero stats when no sessions exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValueOnce([]);

      const stats = await getFocusStats('user-1');

      expect(stats.totalSessions).toBe(0);
      expect(stats.avgDurationMinutes).toBe(0);
      expect(stats.completedDuringFocus).toBe(0);
    });

    it('should handle DB errors and return zero stats', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const stats = await getFocusStats('user-1');

      expect(stats.totalSessions).toBe(0);
      expect(stats.avgDurationMinutes).toBe(0);
      expect(stats.completedDuringFocus).toBe(0);
    });
  });

  describe('shouldInterrupt', () => {
    it('should allow all interrupts when focus mode is not active', async () => {
      const result = await shouldInterrupt('user-1', { priority: 'P2' });

      expect(result).toBe(true);
    });

    it('should allow P0 notifications to interrupt focus mode', async () => {
      await activate('user-1', 'task-1');

      const result = await shouldInterrupt('user-1', { priority: 'P0' });

      expect(result).toBe(true);
    });

    it('should allow urgent priority to interrupt focus mode', async () => {
      await activate('user-1', 'task-1');

      const result = await shouldInterrupt('user-1', { priority: 'urgent' });

      expect(result).toBe(true);
    });

    it('should block P1 notifications during focus mode', async () => {
      await activate('user-1', 'task-1');

      const result = await shouldInterrupt('user-1', { priority: 'P1' });

      expect(result).toBe(false);
    });

    it('should block P2 notifications during focus mode', async () => {
      await activate('user-1', 'task-1');

      const result = await shouldInterrupt('user-1', { priority: 'P2' });

      expect(result).toBe(false);
    });

    it('should block notifications without priority during focus mode', async () => {
      await activate('user-1', 'task-1');

      const result = await shouldInterrupt('user-1', {});

      expect(result).toBe(false);
    });
  });
});
