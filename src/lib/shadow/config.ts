import { prisma } from '@/lib/db';

/**
 * Per-user Shadow config loaded from the DB.
 *
 * Field shape follows the actual Prisma schema (ShadowSafetyConfig,
 * ShadowProactiveConfig). Several fields the spec mentions
 * (requirePinForDeletion, financialThreshold, blastRadiusThreshold)
 * aren't modeled yet — they'll appear as new columns are added.
 */
export interface ShadowSafetyDefaults {
  requirePinForFinancial: boolean;
  requirePinForExternal: boolean;
  requirePinForCrisis: boolean;
  maxBlastRadiusWithoutPin: string;
  phoneConfirmationMode: string;
  alwaysAnnounceBlastRadius: boolean;
}

export interface ShadowProactiveDefaults {
  briefingEnabled: boolean;
  briefingTime: string;
  briefingChannel: string;
  briefingContent: string[];
  callWindowStart: string;
  callWindowEnd: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  cooldownMinutes: number;
  maxCallsPerDay: number;
  maxCallsPerHour: number;
  digestEnabled: boolean;
  digestTime: string | null;
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

  return {
    safety: safety
      ? {
          requirePinForFinancial: safety.requirePinForFinancial,
          requirePinForExternal: safety.requirePinForExternal,
          requirePinForCrisis: safety.requirePinForCrisis,
          maxBlastRadiusWithoutPin: safety.maxBlastRadiusWithoutPin,
          phoneConfirmationMode: safety.phoneConfirmationMode,
          alwaysAnnounceBlastRadius: safety.alwaysAnnounceBlastRadius,
        }
      : defaultSafety(),
    proactive: proactive
      ? {
          briefingEnabled: proactive.briefingEnabled,
          briefingTime: proactive.briefingTime,
          briefingChannel: proactive.briefingChannel,
          briefingContent: Array.isArray(proactive.briefingContent)
            ? (proactive.briefingContent as string[])
            : [],
          callWindowStart: proactive.callWindowStart,
          callWindowEnd: proactive.callWindowEnd,
          quietHoursStart: proactive.quietHoursStart,
          quietHoursEnd: proactive.quietHoursEnd,
          cooldownMinutes: proactive.cooldownMinutes,
          maxCallsPerDay: proactive.maxCallsPerDay,
          maxCallsPerHour: proactive.maxCallsPerHour,
          digestEnabled: proactive.digestEnabled,
          digestTime: proactive.digestTime,
        }
      : defaultProactive(),
    preferences: Object.fromEntries(
      preferences.map((p) => [p.preferenceKey, p.preferenceValue]),
    ),
    // ShadowPermissionOverride isn't modeled in the schema yet.
    overrides: {},
  };
}

function defaultSafety(): ShadowSafetyDefaults {
  return {
    requirePinForFinancial: true,
    requirePinForExternal: false,
    requirePinForCrisis: true,
    maxBlastRadiusWithoutPin: 'entity',
    phoneConfirmationMode: 'voice_pin',
    alwaysAnnounceBlastRadius: true,
  };
}

function defaultProactive(): ShadowProactiveDefaults {
  return {
    briefingEnabled: true,
    briefingTime: '08:00',
    briefingChannel: 'in_app',
    briefingContent: ['calendar', 'inbox', 'tasks'],
    callWindowStart: '09:00',
    callWindowEnd: '18:00',
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    cooldownMinutes: 60,
    maxCallsPerDay: 5,
    maxCallsPerHour: 2,
    digestEnabled: false,
    digestTime: null,
  };
}
