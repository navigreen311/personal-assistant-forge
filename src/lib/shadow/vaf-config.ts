/**
 * VAF (VisionAudioForge) integration config — server-side helpers.
 *
 * Handles reading and writing the per-user VafIntegrationConfig row.
 * If a user does not yet have a row, getVafConfig returns the default
 * shape so callers always get a usable config without needing to
 * pre-seed on signup.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Default VAF config values. Mirrors the schema defaults so the UI can
 * render sensibly for users who have never opened the Advanced Voice
 * Settings panel.
 */
export const DEFAULT_VAF_CONFIG = {
  // Voice pipeline
  sttProvider: 'vaf' as string,
  ttsProvider: 'vaf' as string,
  audioEnhancement: true,
  noiseCancellation: true,
  echoSuppression: true,

  // Voiceprint
  voiceprintEnrolled: false,
  voiceprintEnrolledAt: null as Date | null,
  voiceprintUseForAuth: false,

  // Sentiment
  sentimentOnVoiceforgeCalls: true,
  sentimentAlertThreshold: 0.8,

  // Meeting intelligence
  autoProcessMeetings: false,
  autoExtractActionItems: true,
  autoCreateTasks: true,

  // Vision
  documentAnalysisEnabled: true,
  screenVisionFallback: false,

  // Translation
  primaryLanguage: 'en-US',
  secondaryLanguage: null as string | null,
  autoDetectLanguage: false,
};

export type VafConfigShape = typeof DEFAULT_VAF_CONFIG;

/**
 * Fields the client is permitted to patch via the API. Excludes id,
 * userId, timestamps, and voiceprintEnrolledAt (set server-side when
 * voiceprint enrollment completes).
 */
export const PATCHABLE_VAF_FIELDS = [
  'sttProvider',
  'ttsProvider',
  'audioEnhancement',
  'noiseCancellation',
  'echoSuppression',
  'voiceprintUseForAuth',
  'sentimentOnVoiceforgeCalls',
  'sentimentAlertThreshold',
  'autoProcessMeetings',
  'autoExtractActionItems',
  'autoCreateTasks',
  'documentAnalysisEnabled',
  'screenVisionFallback',
  'primaryLanguage',
  'secondaryLanguage',
  'autoDetectLanguage',
] as const;

export type PatchableVafField = (typeof PATCHABLE_VAF_FIELDS)[number];
export type VafConfigPatch = Partial<Pick<VafConfigShape, PatchableVafField>>;

/**
 * Read the user's VAF config row. If no row exists, lazy-creates one
 * with the default values via upsert so existing and new users alike
 * always have a persistent config row backing the settings UI.
 *
 * Lazy-create on first read (rather than at signup time) covers users
 * who registered before the VAF integration shipped, without the need
 * for a backfill migration.
 */
export async function getVafConfig(userId: string): Promise<VafConfigShape & { userId: string }> {
  // Concurrent first-load race: two parallel API requests for the same fresh
  // user can both miss the row, both attempt the create branch of upsert,
  // and one will lose with P2002 (unique violation on userId). On that loss
  // the row now definitely exists, so re-read once and return it.
  let row;
  try {
    row = await prisma.vafIntegrationConfig.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_VAF_CONFIG },
      update: {},
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      row = await prisma.vafIntegrationConfig.findUniqueOrThrow({
        where: { userId },
      });
    } else {
      throw err;
    }
  }

  return {
    userId: row.userId,
    sttProvider: row.sttProvider,
    ttsProvider: row.ttsProvider,
    audioEnhancement: row.audioEnhancement,
    noiseCancellation: row.noiseCancellation,
    echoSuppression: row.echoSuppression,
    voiceprintEnrolled: row.voiceprintEnrolled,
    voiceprintEnrolledAt: row.voiceprintEnrolledAt,
    voiceprintUseForAuth: row.voiceprintUseForAuth,
    sentimentOnVoiceforgeCalls: row.sentimentOnVoiceforgeCalls,
    sentimentAlertThreshold: row.sentimentAlertThreshold,
    autoProcessMeetings: row.autoProcessMeetings,
    autoExtractActionItems: row.autoExtractActionItems,
    autoCreateTasks: row.autoCreateTasks,
    documentAnalysisEnabled: row.documentAnalysisEnabled,
    screenVisionFallback: row.screenVisionFallback,
    primaryLanguage: row.primaryLanguage,
    secondaryLanguage: row.secondaryLanguage,
    autoDetectLanguage: row.autoDetectLanguage,
  };
}

/**
 * Filter a raw object down to only patchable fields with the right types.
 * Anything unknown / wrong-typed is silently dropped.
 */
function sanitizePatch(input: unknown): VafConfigPatch {
  if (typeof input !== 'object' || input === null) return {};
  const raw = input as Record<string, unknown>;
  const patch: VafConfigPatch = {};

  for (const field of PATCHABLE_VAF_FIELDS) {
    if (!(field in raw)) continue;
    const value = raw[field];

    switch (field) {
      // Booleans
      case 'audioEnhancement':
      case 'noiseCancellation':
      case 'echoSuppression':
      case 'voiceprintUseForAuth':
      case 'sentimentOnVoiceforgeCalls':
      case 'autoProcessMeetings':
      case 'autoExtractActionItems':
      case 'autoCreateTasks':
      case 'documentAnalysisEnabled':
      case 'screenVisionFallback':
      case 'autoDetectLanguage':
        if (typeof value === 'boolean') patch[field] = value;
        break;

      // Floats
      case 'sentimentAlertThreshold':
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
          patch[field] = value;
        }
        break;

      // Strings
      case 'sttProvider':
      case 'ttsProvider':
      case 'primaryLanguage':
        if (typeof value === 'string' && value.length > 0 && value.length <= 20) {
          patch[field] = value;
        }
        break;

      // Nullable string
      case 'secondaryLanguage':
        if (value === null || value === '' || value === undefined) {
          patch[field] = null;
        } else if (typeof value === 'string' && value.length <= 10) {
          patch[field] = value;
        }
        break;
    }
  }

  return patch;
}

/**
 * Update the user's VAF config. Creates the row on first call (upsert).
 * Returns the post-update config in the same shape as getVafConfig.
 */
export async function updateVafConfig(
  userId: string,
  patch: unknown
): Promise<VafConfigShape & { userId: string }> {
  const sanitized = sanitizePatch(patch);

  await prisma.vafIntegrationConfig.upsert({
    where: { userId },
    create: {
      userId,
      ...sanitized,
    },
    update: sanitized,
  });

  return getVafConfig(userId);
}
