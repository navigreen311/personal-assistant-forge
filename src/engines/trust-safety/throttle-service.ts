import type { ThrottleConfig, ThrottleStatus } from './types';

// In-memory store for throttle counters (per-user, per-action)
const hourlyCounters = new Map<string, { count: number; resetAt: Date }>();
const dailyCounters = new Map<string, { count: number; resetAt: Date }>();

function getHourlyKey(userId: string, actionType: string): string {
  return `${userId}:${actionType}:hourly`;
}

function getDailyKey(userId: string, actionType: string): string {
  return `${userId}:${actionType}:daily`;
}

function getOrResetCounter(
  store: Map<string, { count: number; resetAt: Date }>,
  key: string,
  windowMs: number
): { count: number; resetAt: Date } {
  const now = new Date();
  const existing = store.get(key);
  if (existing && existing.resetAt > now) {
    return existing;
  }
  const resetAt = new Date(now.getTime() + windowMs);
  const counter = { count: 0, resetAt };
  store.set(key, counter);
  return counter;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIGS: ThrottleConfig[] = [
  { actionType: 'calls', maxPerHour: 5, maxPerDay: 50, requiresApprovalAbove: 3, cooldownMinutes: 5 },
  { actionType: 'emails', maxPerHour: 20, maxPerDay: 200, requiresApprovalAbove: 15 },
  { actionType: 'financial_tx', maxPerHour: 10, maxPerDay: 1, requiresApprovalAbove: 0, cooldownMinutes: 30 },
  { actionType: 'api_calls', maxPerHour: 100, maxPerDay: 1000 },
  { actionType: 'messages', maxPerHour: 30, maxPerDay: 300 },
];

const customConfigs = new Map<string, ThrottleConfig>();

export function getDefaultThrottleConfigs(): ThrottleConfig[] {
  return [...DEFAULT_CONFIGS];
}

export function getThrottleConfig(actionType: string): ThrottleConfig {
  const custom = customConfigs.get(actionType);
  if (custom) return custom;
  const defaultConfig = DEFAULT_CONFIGS.find(c => c.actionType === actionType);
  return defaultConfig ?? { actionType, maxPerHour: 50, maxPerDay: 500 };
}

export function updateThrottleConfig(actionType: string, config: Partial<ThrottleConfig>): ThrottleConfig {
  const current = getThrottleConfig(actionType);
  const updated: ThrottleConfig = { ...current, ...config, actionType };
  customConfigs.set(actionType, updated);
  return updated;
}

export async function checkThrottle(userId: string, actionType: string): Promise<ThrottleStatus> {
  const config = getThrottleConfig(actionType);
  const hourlyKey = getHourlyKey(userId, actionType);
  const dailyKey = getDailyKey(userId, actionType);

  const hourly = getOrResetCounter(hourlyCounters, hourlyKey, ONE_HOUR_MS);
  const daily = getOrResetCounter(dailyCounters, dailyKey, ONE_DAY_MS);

  const hourlyExceeded = hourly.count >= config.maxPerHour;
  const dailyExceeded = daily.count >= config.maxPerDay;
  const isThrottled = hourlyExceeded || dailyExceeded;

  let nextAllowedAt: Date | undefined;
  if (isThrottled) {
    if (hourlyExceeded && dailyExceeded) {
      nextAllowedAt = hourly.resetAt < daily.resetAt ? hourly.resetAt : daily.resetAt;
    } else if (hourlyExceeded) {
      nextAllowedAt = hourly.resetAt;
    } else {
      nextAllowedAt = daily.resetAt;
    }
  }

  const requiresApproval = config.requiresApprovalAbove !== undefined &&
    (hourly.count >= config.requiresApprovalAbove || daily.count >= config.requiresApprovalAbove);

  return {
    actionType,
    currentHourCount: hourly.count,
    currentDayCount: daily.count,
    maxPerHour: config.maxPerHour,
    maxPerDay: config.maxPerDay,
    isThrottled,
    nextAllowedAt,
    requiresApproval,
  };
}

export async function recordAction(userId: string, actionType: string): Promise<void> {
  const hourlyKey = getHourlyKey(userId, actionType);
  const dailyKey = getDailyKey(userId, actionType);

  const hourly = getOrResetCounter(hourlyCounters, hourlyKey, ONE_HOUR_MS);
  const daily = getOrResetCounter(dailyCounters, dailyKey, ONE_DAY_MS);

  hourly.count += 1;
  daily.count += 1;
}

export async function resetThrottle(userId: string, actionType: string): Promise<void> {
  const hourlyKey = getHourlyKey(userId, actionType);
  const dailyKey = getDailyKey(userId, actionType);
  hourlyCounters.delete(hourlyKey);
  dailyCounters.delete(dailyKey);
}
