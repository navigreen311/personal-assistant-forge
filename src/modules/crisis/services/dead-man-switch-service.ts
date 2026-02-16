import type { DeadManSwitch, DeadManProtocol } from '../types';

const switchStore = new Map<string, DeadManSwitch>();

export async function configure(
  userId: string,
  config: Omit<DeadManSwitch, 'lastCheckIn' | 'missedCheckIns'>
): Promise<DeadManSwitch> {
  const dmSwitch: DeadManSwitch = {
    ...config,
    userId,
    lastCheckIn: new Date(),
    missedCheckIns: 0,
  };
  switchStore.set(userId, dmSwitch);
  return dmSwitch;
}

export async function checkIn(userId: string): Promise<DeadManSwitch> {
  const dmSwitch = switchStore.get(userId);
  if (!dmSwitch) throw new Error(`Dead man switch not configured for user ${userId}`);

  dmSwitch.lastCheckIn = new Date();
  dmSwitch.missedCheckIns = 0;
  switchStore.set(userId, dmSwitch);
  return dmSwitch;
}

export async function evaluateSwitch(userId: string): Promise<{
  triggered: boolean;
  missedCheckIns: number;
  protocols: DeadManProtocol[];
}> {
  const dmSwitch = switchStore.get(userId);
  if (!dmSwitch) throw new Error(`Dead man switch not configured for user ${userId}`);

  if (!dmSwitch.isEnabled) {
    return { triggered: false, missedCheckIns: 0, protocols: [] };
  }

  const now = new Date();
  const lastCheckIn = new Date(dmSwitch.lastCheckIn);
  const hoursSinceCheckIn = (now.getTime() - lastCheckIn.getTime()) / (1000 * 60 * 60);
  const expectedCheckIns = Math.floor(hoursSinceCheckIn / dmSwitch.checkInIntervalHours);

  dmSwitch.missedCheckIns = expectedCheckIns;
  switchStore.set(userId, dmSwitch);

  const triggered = dmSwitch.missedCheckIns >= dmSwitch.triggerAfterMisses;

  return {
    triggered,
    missedCheckIns: dmSwitch.missedCheckIns,
    protocols: triggered ? dmSwitch.protocols : [],
  };
}

export async function getStatus(userId: string): Promise<DeadManSwitch> {
  const dmSwitch = switchStore.get(userId);
  if (!dmSwitch) throw new Error(`Dead man switch not configured for user ${userId}`);
  return dmSwitch;
}

export async function addProtocol(
  userId: string,
  protocol: Omit<DeadManProtocol, 'order'>
): Promise<DeadManSwitch> {
  const dmSwitch = switchStore.get(userId);
  if (!dmSwitch) throw new Error(`Dead man switch not configured for user ${userId}`);

  const order = dmSwitch.protocols.length + 1;
  dmSwitch.protocols.push({ ...protocol, order });
  switchStore.set(userId, dmSwitch);
  return dmSwitch;
}
