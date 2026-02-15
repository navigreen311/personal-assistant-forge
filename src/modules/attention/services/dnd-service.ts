import type { DNDConfig } from '../types';

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

export { dndStore };
