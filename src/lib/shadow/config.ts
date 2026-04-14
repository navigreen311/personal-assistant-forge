import { prisma } from '@/lib/db';

export interface ShadowSafetyDefaults {
  requirePinForFinancial: boolean;
  requirePinForExternal: boolean;
  requirePinForCrisis: boolean;
  requirePinForDeletion: boolean;
  maxBlastRadiusWithoutPin: number;
  financialThreshold: number;
  blastRadiusThreshold: string;
  alwaysAnnounceAffectedCount: boolean;
  alwaysAnnounceCost: boolean;
  alwaysAnnounceIrreversibility: boolean;
}

export interface ShadowProactiveDefaults {
  briefingEnabled: boolean;
  briefingTime: string;
  briefingChannel: string;
  briefingContent: string[];
  eodEnabled: boolean;
  eodTime: string;
}

export interface ShadowConfig {
  safety: ShadowSafetyDefaults;
  proactive: ShadowProactiveDefaults;
  preferences: Record<string, unknown>;
  overrides: Record<string, string>;
}

export async function getShadowConfig(userId: string): Promise<ShadowConfig> {
  const [safety, proactive, preferences] = await Promise.all([
    prisma.shadowSafetyConfig.findUnique({ where: { userId } }),
    prisma.shadowProactiveConfig.findUnique({ where: { userId } }),
    prisma.shadowPreference.findMany({ where: { userId } }),
  ]);
  // ShadowPermissionOverride table not yet modeled in schema — overrides
  // come back empty until that model is added.
  const overrides: Array<{ actionType: string; overrideLevel: string | null }> = [];

  return {
    safety: safety
      ? {
          requirePinForFinancial: safety.requirePinForFinancial,
          requirePinForExternal: safety.requirePinForExternal,
          requirePinForCrisis: safety.requirePinForCrisis,
          requirePinForDeletion: safety.requirePinForDeletion,
          maxBlastRadiusWithoutPin: safety.maxBlastRadiusWithoutPin,
          financialThreshold: Number(safety.financialThreshold),
          blastRadiusThreshold: safety.blastRadiusThreshold,
          alwaysAnnounceAffectedCount: safety.alwaysAnnounceAffectedCount,
          alwaysAnnounceCost: safety.alwaysAnnounceCost,
          alwaysAnnounceIrreversibility: safety.alwaysAnnounceIrreversibility,
        }
      : defaultSafety(),
    proactive: proactive
      ? {
          briefingEnabled: proactive.briefingEnabled,
          briefingTime: proactive.briefingTime?.toString() ?? '08:00',
          briefingChannel: proactive.briefingChannel,
          briefingContent: (proactive.briefingContent as string[]) ?? [],
          eodEnabled: proactive.eodEnabled,
          eodTime: proactive.eodTime?.toString() ?? '18:00',
        }
      : defaultProactive(),
    preferences: Object.fromEntries(
      preferences.map((p) => [p.preferenceKey, p.preferenceValue]),
    ),
    overrides: Object.fromEntries(
      overrides.map((o) => [o.actionType, o.overrideLevel ?? 'none']),
    ),
  };
}

function defaultSafety(): ShadowSafetyDefaults {
  return {
    requirePinForFinancial: true,
    requirePinForExternal: false,
    requirePinForCrisis: true,
    requirePinForDeletion: true,
    maxBlastRadiusWithoutPin: 5,
    financialThreshold: 500,
    blastRadiusThreshold: 'entity',
    alwaysAnnounceAffectedCount: true,
    alwaysAnnounceCost: true,
    alwaysAnnounceIrreversibility: true,
  };
}

function defaultProactive(): ShadowProactiveDefaults {
  return {
    briefingEnabled: true,
    briefingTime: '08:00',
    briefingChannel: 'in_app',
    briefingContent: ['calendar', 'inbox', 'tasks'],
    eodEnabled: false,
    eodTime: '18:00',
  };
}
