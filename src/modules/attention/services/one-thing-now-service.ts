import type { OneThingNowState } from '../types';

const otnStore = new Map<string, OneThingNowState>();

export async function activate(
  userId: string,
  taskId: string,
  sessionMinutes = 60
): Promise<OneThingNowState> {
  const state: OneThingNowState = {
    userId,
    isActive: true,
    currentTask: { taskId, title: `Task ${taskId}`, startedAt: new Date() },
    blockedNotifications: 0,
    sessionDuration: sessionMinutes,
  };
  otnStore.set(userId, state);
  return state;
}

export async function deactivate(userId: string): Promise<OneThingNowState> {
  const state = otnStore.get(userId) || {
    userId,
    isActive: false,
    blockedNotifications: 0,
    sessionDuration: 0,
  };
  state.isActive = false;
  state.currentTask = undefined;
  otnStore.set(userId, state);
  return state;
}

export async function getState(userId: string): Promise<OneThingNowState> {
  return otnStore.get(userId) || {
    userId,
    isActive: false,
    blockedNotifications: 0,
    sessionDuration: 0,
  };
}

export { otnStore };
