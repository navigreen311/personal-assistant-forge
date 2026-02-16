import type { OneThingNowState } from '../types';

function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/db').prisma;
}

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

export async function setFocusTask(userId: string, taskId: string): Promise<OneThingNowState> {
  // Look up the task title from DB
  let title = `Task ${taskId}`;
  try {
    const task = await getPrisma().task.findUnique({ where: { id: taskId } });
    if (task) title = task.title;
  } catch {
    // Use fallback title
  }

  const state = await activate(userId, taskId);
  if (state.currentTask) {
    state.currentTask.title = title;
  }

  // Persist to User preferences
  try {
    const user = await getPrisma().user.findUnique({ where: { id: userId } });
    if (user) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      await getPrisma().user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...prefs,
            focusMode: {
              taskId,
              startedAt: new Date().toISOString(),
              suppressNonUrgent: true,
            },
          },
        },
      });
    }
  } catch {
    // Best-effort persistence
  }

  return state;
}

export async function getFocusTask(userId: string): Promise<OneThingNowState & { task?: { id: string; title: string; status: string; priority: string } | null }> {
  const state = await getState(userId);
  if (!state.isActive || !state.currentTask) {
    return { ...state, task: null };
  }

  let task = null;
  try {
    const dbTask = await getPrisma().task.findUnique({ where: { id: state.currentTask.taskId } });
    if (dbTask) {
      task = {
        id: dbTask.id,
        title: dbTask.title,
        status: dbTask.status,
        priority: dbTask.priority,
      };
    }
  } catch {
    // Return without task details
  }

  return { ...state, task };
}

export async function clearFocusTask(userId: string): Promise<OneThingNowState> {
  const state = otnStore.get(userId);

  // Log the focus session duration
  if (state?.isActive && state.currentTask) {
    const durationMs = Date.now() - state.currentTask.startedAt.getTime();
    try {
      await getPrisma().actionLog.create({
        data: {
          actor: userId,
          actorId: userId,
          actionType: 'FOCUS_SESSION',
          target: state.currentTask.taskId,
          reason: `Focus session on "${state.currentTask.title}" lasted ${Math.round(durationMs / 60000)} minutes`,
          blastRadius: 'LOW',
          reversible: false,
          status: 'COMPLETED',
        },
      });
    } catch {
      // Best-effort logging
    }

    // Clear focus from User preferences
    try {
      const user = await getPrisma().user.findUnique({ where: { id: userId } });
      if (user) {
        const prefs = (user.preferences as Record<string, unknown>) || {};
        delete prefs.focusMode;
        await getPrisma().user.update({
          where: { id: userId },
          data: { preferences: prefs },
        });
      }
    } catch {
      // Best-effort
    }
  }

  return deactivate(userId);
}

export async function getFocusStats(userId: string): Promise<{
  totalSessions: number;
  avgDurationMinutes: number;
  completedDuringFocus: number;
}> {
  try {
    const logs = await getPrisma().actionLog.findMany({
      where: {
        actorId: userId,
        actionType: 'FOCUS_SESSION',
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const durations = logs
      .map((log: { reason: string }) => {
        const match = log.reason.match(/lasted (\d+) minutes/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((d: number) => d > 0);

    const avgDuration = durations.length > 0
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      : 0;

    return {
      totalSessions: logs.length,
      avgDurationMinutes: Math.round(avgDuration),
      completedDuringFocus: logs.filter((l: { status: string }) => l.status === 'COMPLETED').length,
    };
  } catch {
    return {
      totalSessions: 0,
      avgDurationMinutes: 0,
      completedDuringFocus: 0,
    };
  }
}

export async function shouldInterrupt(
  userId: string,
  notification: { priority?: string; contactId?: string }
): Promise<boolean> {
  const state = await getState(userId);
  if (!state.isActive) return true; // Not in focus mode, allow all

  // Only URGENT priority should interrupt focus mode
  if (notification.priority === 'P0' || notification.priority === 'urgent') {
    return true;
  }

  // VIP contacts can break through (reuse DND exception list concept)
  // For focus mode, we keep it strict - only P0 breaks through
  return false;
}

export { otnStore };
