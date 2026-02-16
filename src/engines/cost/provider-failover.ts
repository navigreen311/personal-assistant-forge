import type { ProviderHealth, ProviderFallback } from './types';

// Configurable defaults
const DEFAULT_LATENCY_MS = 50;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60_000;

let healthCheckIntervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS;

// In-memory provider state (intentionally ephemeral -- health status is transient)
const providerHealthCache = new Map<string, ProviderHealth & { lastErrorAt?: Date }>();
const killSwitchActive = new Set<string>();

const DEFAULT_FALLBACKS: ProviderFallback[] = [
  {
    primaryProviderId: 'twilio',
    fallbackProviderId: 'vonage',
    triggerCondition: 'DOWN',
    isAutomatic: true,
    isActive: false,
  },
  {
    primaryProviderId: 'openai',
    fallbackProviderId: 'claude',
    triggerCondition: 'DOWN',
    isAutomatic: true,
    isActive: false,
  },
  {
    primaryProviderId: 'sendgrid',
    fallbackProviderId: 'aws-ses',
    triggerCondition: 'DOWN',
    isAutomatic: true,
    isActive: false,
  },
];

const fallbacks: ProviderFallback[] = [...DEFAULT_FALLBACKS];

export function setHealthCheckInterval(intervalMs: number): void {
  healthCheckIntervalMs = intervalMs;
}

export async function checkProviderHealth(providerId: string): Promise<ProviderHealth> {
  // If kill switch is active, the provider is DOWN
  if (killSwitchActive.has(providerId)) {
    return {
      providerId,
      providerName: providerId,
      status: 'DOWN',
      latencyMs: 0,
      errorRate: 1.0,
      lastChecked: new Date(),
    };
  }

  // Return cached health if still fresh
  const cached = providerHealthCache.get(providerId);
  if (cached && (new Date().getTime() - cached.lastChecked.getTime()) < healthCheckIntervalMs) {
    const { lastErrorAt: _le, ...health } = cached;
    return health;
  }

  const health: ProviderHealth & { lastErrorAt?: Date } = {
    providerId,
    providerName: providerId,
    status: 'HEALTHY',
    latencyMs: DEFAULT_LATENCY_MS,
    errorRate: 0,
    lastChecked: new Date(),
    lastErrorAt: cached?.lastErrorAt,
  };

  providerHealthCache.set(providerId, health);

  const { lastErrorAt: _le, ...result } = health;
  return result;
}

export async function getHealthyProvider(primaryId: string, fallbackId: string): Promise<string> {
  const primaryHealth = await checkProviderHealth(primaryId);

  if (primaryHealth.status === 'HEALTHY') {
    return primaryId;
  }

  const fallbackHealth = await checkProviderHealth(fallbackId);
  if (fallbackHealth.status !== 'DOWN') {
    return fallbackId;
  }

  // Both down, return primary as last resort
  return primaryId;
}

export function listFallbacks(): ProviderFallback[] {
  return [...fallbacks];
}

export function setFallback(
  primaryId: string,
  fallbackId: string,
  triggerCondition: string,
  isAutomatic: boolean
): ProviderFallback {
  const existing = fallbacks.findIndex(f => f.primaryProviderId === primaryId);
  const fb: ProviderFallback = {
    primaryProviderId: primaryId,
    fallbackProviderId: fallbackId,
    triggerCondition: triggerCondition as ProviderFallback['triggerCondition'],
    isAutomatic,
    isActive: false,
  };

  if (existing >= 0) {
    fallbacks[existing] = fb;
  } else {
    fallbacks.push(fb);
  }

  return fb;
}

export async function activateKillSwitch(providerId: string): Promise<void> {
  killSwitchActive.add(providerId);
  // Record error timestamp
  const cached = providerHealthCache.get(providerId);
  if (cached) {
    cached.lastErrorAt = new Date();
  }
  providerHealthCache.delete(providerId);

  // Activate the fallback for this provider
  const fb = fallbacks.find(f => f.primaryProviderId === providerId);
  if (fb) {
    fb.isActive = true;
  }
}

export async function deactivateKillSwitch(providerId: string): Promise<void> {
  killSwitchActive.delete(providerId);
  providerHealthCache.delete(providerId);

  // Deactivate the fallback
  const fb = fallbacks.find(f => f.primaryProviderId === providerId);
  if (fb) {
    fb.isActive = false;
  }
}

// For testing: reset all in-memory state
export function _resetProviderStore(): void {
  providerHealthCache.clear();
  killSwitchActive.clear();
  fallbacks.length = 0;
  fallbacks.push(...DEFAULT_FALLBACKS.map(f => ({ ...f })));
  healthCheckIntervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS;
}
