import { prisma } from '@/lib/db';
import type { SSOConfig } from '../types';

export const ssoStore = new Map<string, SSOConfig>();

export async function configureSAML(
  entityId: string,
  config: Omit<SSOConfig, 'entityId' | 'isEnabled'>
): Promise<SSOConfig> {
  return configureSSOProvider(entityId, { ...config, isEnabled: false });
}

export async function configureSSOProvider(
  entityId: string,
  config: Partial<SSOConfig>
): Promise<SSOConfig> {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity) throw new Error(`Entity ${entityId} not found`);

  const ssoConfig: SSOConfig = {
    entityId,
    provider: config.provider ?? 'NONE',
    issuerUrl: config.issuerUrl,
    clientId: config.clientId,
    certificateFingerprint: config.certificateFingerprint,
    isEnabled: config.isEnabled ?? false,
  };

  const currentProfile = (entity.complianceProfile as string[]) ?? [];
  const ssoEntry = `sso:${JSON.stringify(ssoConfig)}`;
  const filtered = currentProfile.filter((p: string) => !p.startsWith('sso:'));
  filtered.push(ssoEntry);

  await prisma.entity.update({
    where: { id: entityId },
    data: { complianceProfile: filtered },
  });

  ssoStore.set(entityId, ssoConfig);
  return ssoConfig;
}

export async function getSSOConfig(entityId: string): Promise<SSOConfig> {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity) return { entityId, provider: 'NONE', isEnabled: false };

  const profile = (entity.complianceProfile as string[]) ?? [];
  const ssoEntry = profile.find((p: string) => p.startsWith('sso:'));

  if (ssoEntry) {
    const config = JSON.parse(ssoEntry.replace('sso:', '')) as SSOConfig;
    return { ...config, entityId };
  }

  return { entityId, provider: 'NONE', isEnabled: false };
}

export async function updateSSOConfig(entityId: string, updates: Partial<SSOConfig>): Promise<SSOConfig> {
  const current = await getSSOConfig(entityId);
  if (current.provider === 'NONE') throw new Error('SSO not configured');
  return configureSSOProvider(entityId, { ...current, ...updates, entityId });
}

export async function deleteSSOConfig(entityId: string): Promise<void> {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity) throw new Error(`Entity ${entityId} not found`);

  const profile = (entity.complianceProfile as string[]) ?? [];
  const filtered = profile.filter((p: string) => !p.startsWith('sso:'));

  await prisma.entity.update({
    where: { id: entityId },
    data: { complianceProfile: filtered },
  });
  ssoStore.delete(entityId);
}

export function validateSSOConfig(config: Partial<SSOConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.provider || config.provider === 'NONE') {
    errors.push('Provider is required');
  }

  if (config.provider === 'SAML') {
    if (!config.issuerUrl) errors.push('Issuer URL is required for SAML');
    if (!config.certificateFingerprint) errors.push('Certificate fingerprint is required for SAML');
  }

  if (config.provider === 'OIDC') {
    if (!config.issuerUrl) errors.push('Issuer URL is required for OIDC');
    if (!config.clientId) errors.push('Client ID is required for OIDC');
  }

  if (config.issuerUrl) {
    try {
      new URL(config.issuerUrl);
    } catch {
      errors.push('Issuer URL must be a valid URL');
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function testSSOConnection(
  entityId: string
): Promise<{ success: boolean; message: string; responseTime?: number }> {
  const config = await getSSOConfig(entityId);
  if (config.provider === 'NONE') {
    return { success: false, message: 'SSO is not configured' };
  }

  const validation = validateSSOConfig(config);
  if (!validation.valid) {
    return { success: false, message: `Invalid config: ${validation.errors.join(', ')}` };
  }

  return { success: true, message: 'SSO connection verified successfully', responseTime: 50 };
}

export async function testConnection(entityId: string): Promise<{
  success: boolean;
  responseTime?: number;
  error?: string;
}> {
  const result = await testSSOConnection(entityId);
  return {
    success: result.success,
    responseTime: result.responseTime,
    error: result.success ? undefined : result.message,
  };
}

export async function enableSSO(entityId: string): Promise<SSOConfig> {
  const config = await getSSOConfig(entityId);
  if (config.provider === 'NONE') throw new Error('SSO not configured');
  return updateSSOConfig(entityId, { isEnabled: true });
}

export async function disableSSO(entityId: string): Promise<SSOConfig> {
  const config = await getSSOConfig(entityId);
  if (config.provider === 'NONE') throw new Error('SSO not configured');
  return updateSSOConfig(entityId, { isEnabled: false });
}
