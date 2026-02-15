import type { ProviderHealth, ProviderFallback } from './types';

// In-memory provider state
const providerHealthCache = new Map<string, ProviderHealth>();
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

  // Return cached health or simulate healthy
  const cached = providerHealthCache.get(providerId);
  if (cached && (new Date().getTime() - cached.lastChecked.getTime()) < 60000) {
    return cached;
  }

  const health: ProviderHealth = {
    providerId,
    providerName: providerId,
    status: 'HEALTHY',
    latencyMs: Math.floor(Math.random() * 100 + 20),
    errorRate: Math.random() * 0.02,
    lastChecked: new Date(),
  };

  providerHealthCache.set(providerId, health);
  return health;
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
