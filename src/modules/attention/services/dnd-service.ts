import type { DNDConfig } from '../types';

function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/db').prisma;
}

const dndStore = new Map<string, DNDConfig>();

function getDefaultDND(userId: string): DNDConfig {
  return {
    userId,
    isActive: false,
    mode: 'MANUAL',
    vipBreakthroughEnabled: true,
    vipContactIds: [],
  };
}

export async function getDNDConfig(userId: string): Promise<DNDConfig> {
  return dndStore.get(userId) || getDefaultDND(userId);
}

export async function setDND(userId: string, config: Partial<DNDConfig>): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const updated: DNDConfig = { ...current, ...config, userId };
  dndStore.set(userId, updated);
  return updated;
}

export async function isDNDActive(userId: string): Promise<boolean> {
  const config = await getDNDConfig(userId);

  switch (config.mode) {
    case 'MANUAL':
      return config.isActive;

    case 'FOCUS_HOURS': {
      if (!config.startTime || !config.endTime) return false;
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return currentTime >= config.startTime && currentTime <= config.endTime;
    }

    case 'CALENDAR_AWARE':
      // Placeholder: would check calendar for current meetings
      return config.isActive;

    case 'SMART':
      // Combine all signals
      if (config.isActive) return true;
      if (config.startTime && config.endTime) {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentTime >= config.startTime && currentTime <= config.endTime) return true;
      }
      return false;

    default:
      return false;
  }
}

export async function checkVIPBreakthrough(userId: string, contactId: string): Promise<boolean> {
  const config = await getDNDConfig(userId);
  if (!config.vipBreakthroughEnabled) return false;
  return config.vipContactIds.includes(contactId);
}

export async function enableDND(
  userId: string,
  config?: { durationMinutes?: number; exceptions?: string[] }
): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const updated: DNDConfig = {
    ...current,
    isActive: true,
    mode: 'MANUAL',
  };

  if (config?.exceptions) {
    updated.vipContactIds = [...new Set([...updated.vipContactIds, ...config.exceptions])];
  }

  // Store expiresAt in reason field as metadata if duration provided
  if (config?.durationMinutes) {
    const expiresAt = new Date(Date.now() + config.durationMinutes * 60 * 1000);
    updated.reason = JSON.stringify({ expiresAt: expiresAt.toISOString() });
  }

  dndStore.set(userId, updated);

  // Persist to User preferences
  try {
    const user = await getPrisma().user.findUnique({ where: { id: userId } });
    if (user) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      await getPrisma().user.update({
        where: { id: userId },
        data: { preferences: { ...prefs, dnd: updated } },
      });
    }
  } catch {
    // Best-effort persistence
  }

  return updated;
}

export async function disableDND(userId: string): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const updated: DNDConfig = {
    ...current,
    isActive: false,
    reason: undefined,
  };
  dndStore.set(userId, updated);

  try {
    const user = await getPrisma().user.findUnique({ where: { id: userId } });
    if (user) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      await getPrisma().user.update({
        where: { id: userId },
        data: { preferences: { ...prefs, dnd: updated } },
      });
    }
  } catch {
    // Best-effort
  }

  return updated;
}

export async function setQuietHours(
  userId: string,
  startHour: number,
  endHour: number,
  _timezone?: string
): Promise<DNDConfig> {
  const startTime = `${String(startHour).padStart(2, '0')}:00`;
  const endTime = `${String(endHour).padStart(2, '0')}:00`;

  return setDND(userId, {
    mode: 'FOCUS_HOURS',
    startTime,
    endTime,
  });
}

export async function addException(userId: string, contactId: string): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const vipContactIds = [...new Set([...current.vipContactIds, contactId])];
  return setDND(userId, { vipContactIds, vipBreakthroughEnabled: true });
}

export async function shouldSuppress(
  userId: string,
  notification: { priority?: string; source?: string; contactId?: string }
): Promise<boolean> {
  const active = await isDNDActive(userId);
  if (!active) return false;

  // Check exceptions
  if (notification.contactId) {
    const isVIP = await checkVIPBreakthrough(userId, notification.contactId);
    if (isVIP) return false;
  }

  // Urgent priority breaks through
  if (notification.priority === 'P0' || notification.priority === 'urgent') {
    return false;
  }

  return true;
}

export { dndStore };
