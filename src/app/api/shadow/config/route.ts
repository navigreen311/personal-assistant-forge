import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Default values for each config section
// ---------------------------------------------------------------------------

const DEFAULT_GENERAL = {
  name: 'Shadow',
  tone: 'professional-friendly',
  verbosity: 3,
  proactivityLevel: 3,
  floatingBubble: true,
  defaultInputMode: 'text',
  autoSpeakResponses: false,
  wakeWordEnabled: false,
  wakeWord: 'Hey Shadow',
  keyboardShortcut: 'Ctrl+Shift+S',
  sidekickMode: false,
};

const DEFAULT_VOICE_PHONE = {
  voicePersona: 'default',
  speechSpeed: 1.0,
  language: 'en',
  shadowPhoneNumber: '+1 (555) 0100-SHADOW',
  userPhoneNumbers: [],
  inboundCalls: true,
  outboundCalls: false,
  voicemail: true,
  autoRecording: false,
  autoTranscribe: true,
};

// Keys for general and voicePhone that map to ShadowPreference rows
const GENERAL_PREF_KEYS = [
  'name', 'tone', 'verbosity', 'proactivityLevel', 'floatingBubble',
  'defaultInputMode', 'autoSpeakResponses', 'wakeWordEnabled', 'wakeWord',
  'keyboardShortcut', 'sidekickMode',
];

const VOICE_PHONE_PREF_KEYS = [
  'voicePersona', 'speechSpeed', 'language', 'shadowPhoneNumber',
  'userPhoneNumbers', 'inboundCalls', 'outboundCalls', 'voicemail',
  'autoRecording', 'autoTranscribe',
];

// ---------------------------------------------------------------------------
// Helpers: read preferences from ShadowPreference table
// ---------------------------------------------------------------------------

async function readPreferences(userId: string, prefix: string, keys: string[]): Promise<Record<string, unknown>> {
  const prefs = await prisma.shadowPreference.findMany({
    where: {
      userId,
      preferenceKey: { in: keys.map((k) => `${prefix}.${k}`) },
    },
  });

  const result: Record<string, unknown> = {};
  for (const pref of prefs) {
    const key = pref.preferenceKey.replace(`${prefix}.`, '');
    try {
      result[key] = JSON.parse(pref.preferenceValue);
    } catch {
      result[key] = pref.preferenceValue;
    }
  }
  return result;
}

async function writePreferences(
  userId: string,
  prefix: string,
  data: Record<string, unknown>
): Promise<void> {
  const upserts = Object.entries(data).map(([key, value]) => {
    const prefKey = `${prefix}.${key}`;
    const prefValue = typeof value === 'string' ? value : JSON.stringify(value);
    return prisma.shadowPreference.upsert({
      where: { userId_preferenceKey: { userId, preferenceKey: prefKey } },
      create: {
        userId,
        preferenceKey: prefKey,
        preferenceValue: prefValue,
        learnedFrom: 'explicit',
        confidence: 1.0,
      },
      update: {
        preferenceValue: prefValue,
      },
    });
  });
  await prisma.$transaction(upserts);
}

// ---------------------------------------------------------------------------
// GET /api/shadow/config — Load all Shadow config for the authenticated user
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;

    // Load all config sections in parallel
    const [generalPrefs, voicePhonePrefs, safetyConfig, proactiveConfig, permissionPrefs] =
      await Promise.all([
        readPreferences(userId, 'general', GENERAL_PREF_KEYS),
        readPreferences(userId, 'voicePhone', VOICE_PHONE_PREF_KEYS),
        prisma.shadowSafetyConfig.findUnique({ where: { userId } }),
        prisma.shadowProactiveConfig.findUnique({ where: { userId } }),
        readPreferences(userId, 'permissions', ['autonomyLevel', 'actions']),
      ]);

    // Build response
    const general = { ...DEFAULT_GENERAL, ...generalPrefs };
    const voicePhone = { ...DEFAULT_VOICE_PHONE, ...voicePhonePrefs };

    const safety = safetyConfig
      ? {
          voicePinSet: !!safetyConfig.voicePin,
          newPin: '',
          confirmPin: '',
          requirePinForFinancial: safetyConfig.requirePinForFinancial,
          requirePinForExternal: safetyConfig.requirePinForExternal,
          requirePinForCrisis: safetyConfig.requirePinForCrisis,
          blastRadiusThreshold: safetyConfig.maxBlastRadiusWithoutPin,
          financialThreshold: 500, // Not stored in current schema; default
          alwaysAnnounceAffectedCount: safetyConfig.alwaysAnnounceBlastRadius,
          alwaysAnnounceCost: true,
          alwaysAnnounceIrreversibility: true,
        }
      : undefined;

    const proactive = proactiveConfig
      ? {
          briefingEnabled: proactiveConfig.briefingEnabled,
          briefingTime: proactiveConfig.briefingTime,
          briefingChannel: proactiveConfig.briefingChannel,
          briefingContent: proactiveConfig.briefingContent as string[],
          endOfDayEnabled: false,
          endOfDayTime: '17:00',
          endOfDayChannel: 'in_app',
          callTriggers: proactiveConfig.callTriggers as Array<{
            name: string;
            label: string;
            locked?: boolean;
            lockedValue?: string;
            value: string;
          }> | undefined,
          callWindowStart: proactiveConfig.callWindowStart,
          callWindowEnd: proactiveConfig.callWindowEnd,
          quietHoursStart: proactiveConfig.quietHoursStart,
          quietHoursEnd: proactiveConfig.quietHoursEnd,
          cooldownMinutes: proactiveConfig.cooldownMinutes,
          maxCallsPerDay: proactiveConfig.maxCallsPerDay,
          maxCallsPerHour: proactiveConfig.maxCallsPerHour,
          vipContacts: proactiveConfig.vipBreakoutContacts as string[],
          digestEnabled: proactiveConfig.digestEnabled,
          digestTime: proactiveConfig.digestTime ?? '18:00',
        }
      : undefined;

    const permissions = permissionPrefs.autonomyLevel
      ? {
          autonomyLevel: permissionPrefs.autonomyLevel as string,
          actions: permissionPrefs.actions as Array<{
            action: string;
            label: string;
            defaultLevel: string;
            override: string;
          }> | undefined,
        }
      : undefined;

    return success({
      general,
      voicePhone,
      safety,
      proactive,
      permissions,
    });
  } catch (err) {
    console.error('[shadow/config] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load Shadow config', 500);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/shadow/config — Update Shadow config (partial update by section)
// ---------------------------------------------------------------------------

async function handlePut(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;
    const body = await req.json();

    const updates: Record<string, unknown> = {};

    // --- General ---
    if (body.general) {
      await writePreferences(userId, 'general', body.general);
      updates.general = body.general;
    }

    // --- Voice & Phone ---
    if (body.voicePhone) {
      await writePreferences(userId, 'voicePhone', body.voicePhone);
      updates.voicePhone = body.voicePhone;
    }

    // --- Safety ---
    if (body.safety) {
      const safetyData = body.safety;
      const upsertData: Record<string, unknown> = {
        requirePinForFinancial: safetyData.requirePinForFinancial ?? true,
        requirePinForExternal: safetyData.requirePinForExternal ?? false,
        requirePinForCrisis: safetyData.requirePinForCrisis ?? true,
        maxBlastRadiusWithoutPin: safetyData.blastRadiusThreshold ?? 'entity',
        alwaysAnnounceBlastRadius: safetyData.alwaysAnnounceAffectedCount ?? true,
      };

      // Only update PIN if a new one was provided
      if (safetyData.newPin && safetyData.newPin.length >= 4) {
        upsertData.voicePin = safetyData.newPin; // In production, this would be hashed
      }

      await prisma.shadowSafetyConfig.upsert({
        where: { userId },
        create: {
          userId,
          ...upsertData,
          phoneConfirmationMode: 'voice_pin',
        } as Parameters<typeof prisma.shadowSafetyConfig.create>[0]['data'],
        update: upsertData as Parameters<typeof prisma.shadowSafetyConfig.update>[0]['data'],
      });

      // Store financial threshold and other fields not in the safety schema as preferences
      if (safetyData.financialThreshold !== undefined) {
        await writePreferences(userId, 'safety', {
          financialThreshold: safetyData.financialThreshold,
          alwaysAnnounceCost: safetyData.alwaysAnnounceCost ?? true,
          alwaysAnnounceIrreversibility: safetyData.alwaysAnnounceIrreversibility ?? true,
        });
      }

      updates.safety = body.safety;
    }

    // --- Proactive ---
    if (body.proactive) {
      const p = body.proactive;
      await prisma.shadowProactiveConfig.upsert({
        where: { userId },
        create: {
          userId,
          briefingEnabled: p.briefingEnabled ?? true,
          briefingTime: p.briefingTime ?? '08:00',
          briefingChannel: p.briefingChannel ?? 'in_app',
          briefingContent: p.briefingContent ?? [],
          callTriggers: p.callTriggers ?? null,
          vipBreakoutContacts: p.vipContacts ?? [],
          callWindowStart: p.callWindowStart ?? '09:00',
          callWindowEnd: p.callWindowEnd ?? '18:00',
          quietHoursStart: p.quietHoursStart ?? '22:00',
          quietHoursEnd: p.quietHoursEnd ?? '07:00',
          cooldownMinutes: p.cooldownMinutes ?? 60,
          maxCallsPerDay: p.maxCallsPerDay ?? 5,
          maxCallsPerHour: p.maxCallsPerHour ?? 2,
          digestEnabled: p.digestEnabled ?? false,
          digestTime: p.digestTime ?? null,
        },
        update: {
          briefingEnabled: p.briefingEnabled,
          briefingTime: p.briefingTime,
          briefingChannel: p.briefingChannel,
          briefingContent: p.briefingContent,
          callTriggers: p.callTriggers ?? undefined,
          vipBreakoutContacts: p.vipContacts,
          callWindowStart: p.callWindowStart,
          callWindowEnd: p.callWindowEnd,
          quietHoursStart: p.quietHoursStart,
          quietHoursEnd: p.quietHoursEnd,
          cooldownMinutes: p.cooldownMinutes,
          maxCallsPerDay: p.maxCallsPerDay,
          maxCallsPerHour: p.maxCallsPerHour,
          digestEnabled: p.digestEnabled,
          digestTime: p.digestTime,
        },
      });

      // Store end-of-day settings in preferences (not in proactive schema)
      if (p.endOfDayEnabled !== undefined) {
        await writePreferences(userId, 'proactive', {
          endOfDayEnabled: p.endOfDayEnabled,
          endOfDayTime: p.endOfDayTime ?? '17:00',
          endOfDayChannel: p.endOfDayChannel ?? 'in_app',
        });
      }

      updates.proactive = body.proactive;
    }

    // --- Permissions ---
    if (body.permissions) {
      await writePreferences(userId, 'permissions', {
        autonomyLevel: body.permissions.autonomyLevel,
        actions: body.permissions.actions,
      });
      updates.permissions = body.permissions;
    }

    return success(updates);
  } catch (err) {
    console.error('[shadow/config] PUT error:', err);
    return error('INTERNAL_ERROR', 'Failed to update Shadow config', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function PUT(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePut);
}
