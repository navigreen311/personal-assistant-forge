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
  customTone: '',
  verbosity: 3,
  proactivityLevel: 3,
  floatingBubble: true,
  defaultInputMode: 'text',
  autoSpeakResponses: false,
  wakeWordEnabled: false,
  wakeWord: 'Hey Shadow',
  useCustomWakeWord: false,
  keyboardShortcut: 'Ctrl+Shift+S',
  sidekickMode: false,
  sidekickAutoActivate: true,
  sidekickObservationFrequency: 'normal',
  sidekickNotificationThreshold: 'p0_only',
};

const DEFAULT_VOICE_PHONE = {
  voicePersona: 'default',
  speechSpeed: 1.0,
  language: 'en',
  secondaryLanguage: '',
  shadowPhoneNumber: '+1 (555) 0100-SHADOW',
  userPhoneNumbers: [],
  inboundCalls: true,
  outboundCalls: false,
  voicemail: true,
  autoRecording: false,
  autoTranscribe: true,
  carplayBluetooth: false,
  smsCompanion: true,
  callSummary: true,
  noiseCancellation: true,
  echoSuppression: true,
  autoSwitchOnPoorConnection: true,
  vadSensitivity: 'normal',
};

// Keys for general and voicePhone that map to ShadowPreference rows
const GENERAL_PREF_KEYS = [
  'name', 'tone', 'customTone', 'verbosity', 'proactivityLevel', 'floatingBubble',
  'defaultInputMode', 'autoSpeakResponses', 'wakeWordEnabled', 'wakeWord',
  'useCustomWakeWord', 'keyboardShortcut', 'sidekickMode',
  'sidekickAutoActivate', 'sidekickObservationFrequency', 'sidekickNotificationThreshold',
];

const VOICE_PHONE_PREF_KEYS = [
  'voicePersona', 'speechSpeed', 'language', 'secondaryLanguage',
  'shadowPhoneNumber', 'userPhoneNumbers', 'inboundCalls', 'outboundCalls',
  'voicemail', 'autoRecording', 'autoTranscribe',
  'carplayBluetooth', 'smsCompanion', 'callSummary',
  'noiseCancellation', 'echoSuppression', 'autoSwitchOnPoorConnection', 'vadSensitivity',
];

const PROACTIVE_PREF_KEYS = [
  'endOfDayEnabled', 'endOfDayTime', 'endOfDayChannel', 'endOfDayContent',
  'briefingEntityScope', 'briefingLength',
  'activeDays', 'emergencyOverride',
  'vipKeywords', 'digestMinItems',
  'escalationAttempts', 'escalationWaitMinutes', 'escalationFinalFallback', 'phoneTreeContacts',
];

const DEFAULT_PROACTIVE_PREFS = {
  endOfDayEnabled: false,
  endOfDayTime: '17:00',
  endOfDayChannel: 'in_app',
  endOfDayContent: [] as string[],
  briefingEntityScope: 'all',
  briefingLength: 'standard',
  activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'] as string[],
  emergencyOverride: true,
  vipKeywords: [] as string[],
  digestMinItems: 3,
  escalationAttempts: 3,
  escalationWaitMinutes: 15,
  escalationFinalFallback: 'sms',
  phoneTreeContacts: [] as string[],
};

// ---------------------------------------------------------------------------
// Hardcoded metadata for permission actions (not user-editable)
// ---------------------------------------------------------------------------

const ACTIONS_METADATA: Record<string, { reversible: boolean; blastRadius: string }> = {
  navigate: { reversible: true, blastRadius: 'self' },
  read_data: { reversible: true, blastRadius: 'self' },
  classify_email: { reversible: true, blastRadius: 'self' },
  search_knowledge: { reversible: true, blastRadius: 'self' },
  create_task: { reversible: true, blastRadius: 'self' },
  draft_email: { reversible: true, blastRadius: 'self' },
  modify_calendar: { reversible: true, blastRadius: 'self' },
  complete_task: { reversible: true, blastRadius: 'self' },
  create_invoice: { reversible: true, blastRadius: 'entity' },
  send_email: { reversible: false, blastRadius: 'external' },
  send_invoice: { reversible: false, blastRadius: 'external' },
  trigger_workflow: { reversible: false, blastRadius: 'entity' },
  place_call: { reversible: false, blastRadius: 'external' },
  bulk_email: { reversible: false, blastRadius: 'external' },
  declare_crisis: { reversible: false, blastRadius: 'entity' },
  delete_data: { reversible: false, blastRadius: 'entity' },
  activate_phone_tree: { reversible: false, blastRadius: 'external' },
  make_payment: { reversible: false, blastRadius: 'external' },
};

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
    const [generalPrefs, voicePhonePrefs, safetyConfig, proactiveConfig, permissionPrefs, proactivePrefs, safetyPrefs] =
      await Promise.all([
        readPreferences(userId, 'general', GENERAL_PREF_KEYS),
        readPreferences(userId, 'voicePhone', VOICE_PHONE_PREF_KEYS),
        prisma.shadowSafetyConfig.findUnique({ where: { userId } }),
        prisma.shadowProactiveConfig.findUnique({ where: { userId } }),
        readPreferences(userId, 'permissions', ['autonomyLevel', 'actions']),
        readPreferences(userId, 'proactive', PROACTIVE_PREF_KEYS),
        readPreferences(userId, 'safety', ['pinSetDate', 'requirePinForDataDeletion', 'financialThreshold', 'alwaysAnnounceCost', 'alwaysAnnounceIrreversibility']),
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
          requirePinForDataDeletion: (safetyPrefs.requirePinForDataDeletion as boolean) ?? true,
          blastRadiusThreshold: safetyConfig.maxBlastRadiusWithoutPin,
          financialThreshold: (safetyPrefs.financialThreshold as number) ?? 500,
          alwaysAnnounceAffectedCount: safetyConfig.alwaysAnnounceBlastRadius,
          alwaysAnnounceCost: (safetyPrefs.alwaysAnnounceCost as boolean) ?? true,
          alwaysAnnounceIrreversibility: (safetyPrefs.alwaysAnnounceIrreversibility as boolean) ?? true,
          pinSetDate: (safetyPrefs.pinSetDate as string) ?? null,
        }
      : undefined;

    // Merge proactive preferences with defaults
    const mergedProactivePrefs = { ...DEFAULT_PROACTIVE_PREFS, ...proactivePrefs };

    const proactive = proactiveConfig
      ? {
          briefingEnabled: proactiveConfig.briefingEnabled,
          briefingTime: proactiveConfig.briefingTime,
          briefingChannel: proactiveConfig.briefingChannel,
          briefingContent: proactiveConfig.briefingContent as string[],
          endOfDayEnabled: mergedProactivePrefs.endOfDayEnabled as boolean,
          endOfDayTime: mergedProactivePrefs.endOfDayTime as string,
          endOfDayChannel: mergedProactivePrefs.endOfDayChannel as string,
          endOfDayContent: mergedProactivePrefs.endOfDayContent as string[],
          briefingEntityScope: mergedProactivePrefs.briefingEntityScope as string,
          briefingLength: mergedProactivePrefs.briefingLength as string,
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
          activeDays: mergedProactivePrefs.activeDays as string[],
          emergencyOverride: mergedProactivePrefs.emergencyOverride as boolean,
          vipKeywords: mergedProactivePrefs.vipKeywords as string[],
          digestMinItems: mergedProactivePrefs.digestMinItems as number,
          escalationAttempts: mergedProactivePrefs.escalationAttempts as number,
          escalationWaitMinutes: mergedProactivePrefs.escalationWaitMinutes as number,
          escalationFinalFallback: mergedProactivePrefs.escalationFinalFallback as string,
          phoneTreeContacts: mergedProactivePrefs.phoneTreeContacts as string[],
        }
      : undefined;

    const rawActions = permissionPrefs.actions as Array<{
      action: string;
      label: string;
      defaultLevel: string;
      override: string;
    }> | undefined;

    const enrichedActions = rawActions?.map((a) => ({
      ...a,
      ...(ACTIONS_METADATA[a.action] ?? {}),
    }));

    const permissions = permissionPrefs.autonomyLevel
      ? {
          autonomyLevel: permissionPrefs.autonomyLevel as string,
          actions: enrichedActions,
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

      // Store fields not in the safety schema as preferences
      const safetyPrefsToWrite: Record<string, unknown> = {};
      if (safetyData.financialThreshold !== undefined) {
        safetyPrefsToWrite.financialThreshold = safetyData.financialThreshold;
      }
      if (safetyData.alwaysAnnounceCost !== undefined) {
        safetyPrefsToWrite.alwaysAnnounceCost = safetyData.alwaysAnnounceCost;
      }
      if (safetyData.alwaysAnnounceIrreversibility !== undefined) {
        safetyPrefsToWrite.alwaysAnnounceIrreversibility = safetyData.alwaysAnnounceIrreversibility;
      }
      if (safetyData.requirePinForDataDeletion !== undefined) {
        safetyPrefsToWrite.requirePinForDataDeletion = safetyData.requirePinForDataDeletion;
      }
      if (Object.keys(safetyPrefsToWrite).length > 0) {
        await writePreferences(userId, 'safety', safetyPrefsToWrite);
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

      // Store proactive preference fields (not in proactive schema)
      const proactivePrefsToWrite: Record<string, unknown> = {};
      const proactivePrefFields: Array<{ key: string; fallback: unknown }> = [
        { key: 'endOfDayEnabled', fallback: undefined },
        { key: 'endOfDayTime', fallback: '17:00' },
        { key: 'endOfDayChannel', fallback: 'in_app' },
        { key: 'endOfDayContent', fallback: undefined },
        { key: 'briefingEntityScope', fallback: undefined },
        { key: 'briefingLength', fallback: undefined },
        { key: 'activeDays', fallback: undefined },
        { key: 'emergencyOverride', fallback: undefined },
        { key: 'vipKeywords', fallback: undefined },
        { key: 'digestMinItems', fallback: undefined },
        { key: 'escalationAttempts', fallback: undefined },
        { key: 'escalationWaitMinutes', fallback: undefined },
        { key: 'escalationFinalFallback', fallback: undefined },
        { key: 'phoneTreeContacts', fallback: undefined },
      ];
      for (const { key, fallback } of proactivePrefFields) {
        if (p[key] !== undefined) {
          proactivePrefsToWrite[key] = p[key];
        } else if (fallback !== undefined && proactivePrefsToWrite[key] === undefined) {
          // Only apply fallback if a related field is being written
          // (e.g., endOfDayTime defaults when endOfDayEnabled is set)
        }
      }
      // If endOfDayEnabled is set, ensure time/channel have defaults
      if (p.endOfDayEnabled !== undefined) {
        if (proactivePrefsToWrite.endOfDayTime === undefined) {
          proactivePrefsToWrite.endOfDayTime = '17:00';
        }
        if (proactivePrefsToWrite.endOfDayChannel === undefined) {
          proactivePrefsToWrite.endOfDayChannel = 'in_app';
        }
      }
      if (Object.keys(proactivePrefsToWrite).length > 0) {
        await writePreferences(userId, 'proactive', proactivePrefsToWrite);
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
