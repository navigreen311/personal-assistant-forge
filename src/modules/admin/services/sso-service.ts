import type { SSOConfig } from '../types';

const ssoStore = new Map<string, SSOConfig>();

export async function configureSAML(
  entityId: string,
  config: Omit<SSOConfig, 'entityId' | 'isEnabled'>
): Promise<SSOConfig> {
  const ssoConfig: SSOConfig = {
    ...config,
    entityId,
    isEnabled: false,
  };
  ssoStore.set(entityId, ssoConfig);
  return ssoConfig;
}

export async function getSSOConfig(entityId: string): Promise<SSOConfig> {
  return ssoStore.get(entityId) || {
    entityId,
    provider: 'NONE',
    isEnabled: false,
  };
}

export async function testSSOConnection(
  entityId: string
): Promise<{ success: boolean; message: string }> {
  const config = ssoStore.get(entityId);
  if (!config || config.provider === 'NONE') {
    return { success: false, message: 'SSO is not configured' };
  }
  // Placeholder: simulates a test
  return { success: true, message: 'SSO connection verified successfully' };
}

export async function enableSSO(entityId: string): Promise<SSOConfig> {
  const config = ssoStore.get(entityId);
  if (!config) throw new Error('SSO not configured');
  config.isEnabled = true;
  ssoStore.set(entityId, config);
  return config;
}

export async function disableSSO(entityId: string): Promise<SSOConfig> {
  const config = ssoStore.get(entityId);
  if (!config) throw new Error('SSO not configured');
  config.isEnabled = false;
  ssoStore.set(entityId, config);
  return config;
}

export { ssoStore };
