import {
  activate,
  deactivate,
  getState,
  otnStore,
} from '@/modules/attention/services/one-thing-now-service';

describe('OneThingNowService', () => {
  beforeEach(() => {
    otnStore.clear();
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
});
