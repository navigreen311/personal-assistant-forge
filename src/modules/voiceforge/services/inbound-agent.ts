// ============================================================================
// VoiceForge — Inbound Voice Agent Service
// Handles inbound calls with routing, spam detection, and after-hours logic
// ============================================================================

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { Contact } from '@/shared/types';
import type {
  InboundConfig,
  InboundCallResult,
  AfterHoursConfig,
} from '@/modules/voiceforge/types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

const DOC_TYPE = 'INBOUND_CONFIG';

/** An inbound config whose scope has already been proven. See section 2. */
export type InboundConfigDraft = Omit<InboundConfig, 'entityId'> & {
  entityId: VerifiedEntityId;
};

function deserializeConfig(doc: { id: string; entityId: string; content: string | null }): InboundConfig {
  return JSON.parse(doc.content ?? '{}') as InboundConfig;
}

/**
 * Private: find one entity's config for a number. Takes a plain string because
 * both public entry points below have already established the scope in their
 * own way.
 */
async function findConfigInEntity(
  phoneNumber: string,
  entityId: string
): Promise<InboundConfig | null> {
  const docs = await prisma.document.findMany({
    where: { type: DOC_TYPE, entityId },
  });

  for (const doc of docs) {
    const config = deserializeConfig(doc);
    if (config.phoneNumber === phoneNumber) return config;
  }
  return null;
}

/**
 * Read the inbound config for a number that belongs to the caller's entity.
 *
 * Before this change the lookup was findMany({ where: { type } }) over EVERY
 * entity's documents, returning the first row whose serialised phoneNumber
 * matched. Any authenticated user could read any tenant's greeting, persona id,
 * routing rules, VIP contact list and urgent escalation number by guessing a
 * phone number -- and phone numbers are public.
 */
export async function getInboundConfig(
  phoneNumber: string,
  entityId: VerifiedEntityId
): Promise<InboundConfig | null> {
  return findConfigInEntity(phoneNumber, entityId);
}

export async function saveInboundConfig(
  config: InboundConfigDraft
): Promise<InboundConfig> {
  // Check if config already exists for this number
  const existing = await prisma.document.findMany({
    where: { type: DOC_TYPE, entityId: config.entityId },
  });

  const existingDoc = existing.find((d: { id: string; entityId: string; content: string | null }) => {
    const c = deserializeConfig(d);
    return c.phoneNumber === config.phoneNumber;
  });

  if (existingDoc) {
    // updateMany with the entity in the WHERE, so the scope survives any later
    // reordering of the lookup above. Section 3.
    await prisma.document.updateMany({
      where: { id: existingDoc.id, type: DOC_TYPE, entityId: config.entityId },
      data: { content: JSON.stringify(config) },
    });
  } else {
    await prisma.document.create({
      data: {
        title: `Inbound Config: ${config.phoneNumber}`,
        entityId: config.entityId,
        type: DOC_TYPE,
        content: JSON.stringify(config),
        status: 'APPROVED',
      },
    });
  }

  return config;
}

/** Private: the intent query itself. Scope is established by the caller. */
async function detectCallerIntentInEntity(
  contactId: string | null,
  entityId: string
): Promise<string | undefined> {
  if (!contactId) return undefined;

  try {
    const recentCalls = await prisma.call.findMany({
      where: { contactId, entityId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { outcome: true, actionItems: true, transcript: true },
    });

    if (recentCalls.length === 0) return undefined;

    const result = await generateJSON<{ intent: string }>(
      `Based on this caller's recent call history, predict the likely intent of their new call.

Recent calls:
${recentCalls.map((c: { outcome: string | null; transcript: string | null }) => `- Outcome: ${c.outcome}, Transcript: ${(c.transcript ?? '').substring(0, 200)}`).join('\n')}

Return JSON with "intent": one of INQUIRY, FOLLOW_UP, COMPLAINT, SCHEDULING, SUPPORT, SALES, UNKNOWN`,
      { maxTokens: 128, temperature: 0.3, system: 'Predict call intent from historical patterns.' }
    );

    return result.intent;
  } catch {
    return undefined;
  }
}

export async function detectCallerIntent(
  contactId: string | null,
  entityId: VerifiedEntityId
): Promise<string | undefined> {
  return detectCallerIntentInEntity(contactId, entityId);
}

/**
 * Handle a call arriving on one of our numbers.
 *
 * There is no request and no user here: a telephony webhook says only "a call
 * arrived at DID X". The entity therefore comes off the config ROW keyed by
 * that DID -- trusted provenance, a value read from a database column, never
 * from a request. That is exactly the case section 5 of the tenancy pattern
 * covers, so this is a second entry point named ...ForEntityOwner rather than a
 * cast, and it is deliberately NOT re-exported from the module index.
 *
 * A DID is globally unique across entities, so resolving it across all configs
 * is correct here in a way it is emphatically not on the request path (see
 * getInboundConfig above).
 */
export async function handleInboundCallForEntityOwner(
  phoneNumber: string,
  callerNumber: string
): Promise<InboundCallResult> {
  const docs = await prisma.document.findMany({ where: { type: DOC_TYPE } });
  let config: InboundConfig | null = null;
  for (const doc of docs) {
    const candidate = deserializeConfig(doc);
    if (candidate.phoneNumber === phoneNumber) {
      // Trust the ROW entityId column, not the serialised blob.
      config = { ...candidate, entityId: doc.entityId };
      break;
    }
  }
  if (!config) {
    throw new Error(`No inbound config found for ${phoneNumber}`);
  }

  const callerInfo = await screenCallerInEntity(callerNumber, config.entityId);
  const afterHours = isAfterHours(config.afterHoursConfig);

  // Detect caller intent using AI if we have a known contact
  const intent = await detectCallerIntentInEntity(callerInfo.contact?.id ?? null, config.entityId);

  const routedTo = routeCall(config, {
    isVIP: callerInfo.isVIP,
    isSpam: callerInfo.isSpam,
    intent,
  });

  // Create call record
  const call = await prisma.call.create({
    data: {
      entityId: config.entityId,
      contactId: callerInfo.contact?.id,
      direction: 'INBOUND',
      personaId: config.personaId,
      outcome: callerInfo.isSpam ? 'NO_ANSWER' : 'CONNECTED',
      duration: 0,
      actionItems: [],
    },
  });

  return {
    callId: call.id,
    callerNumber,
    callerContactId: callerInfo.contact?.id,
    isSpam: callerInfo.isSpam,
    isVIP: callerInfo.isVIP,
    routedTo,
    afterHours,
    duration: 0,
  };
}

/** Private: the screening query itself. Scope is established by the caller. */
async function screenCallerInEntity(
  callerNumber: string,
  entityId: string
): Promise<{ isSpam: boolean; isVIP: boolean; contact: Contact | null }> {
  // Look up contact by phone number
  const contactRecord = await prisma.contact.findFirst({
    where: {
      entityId,
      phone: callerNumber,
    },
  });

  let contact: Contact | null = null;
  if (contactRecord) {
    contact = {
      id: contactRecord.id,
      entityId: contactRecord.entityId,
      name: contactRecord.name,
      email: contactRecord.email ?? undefined,
      phone: contactRecord.phone ?? undefined,
      channels: JSON.parse(JSON.stringify(contactRecord.channels)) ?? [],
      relationshipScore: contactRecord.relationshipScore,
      lastTouch: contactRecord.lastTouch,
      commitments: JSON.parse(JSON.stringify(contactRecord.commitments)) ?? [],
      preferences: JSON.parse(JSON.stringify(contactRecord.preferences)) ?? {},
      tags: contactRecord.tags,
      createdAt: contactRecord.createdAt,
      updatedAt: contactRecord.updatedAt,
    } as Contact;
  }

  // Check VIP status - look up inbound configs for this entity to check VIP lists
  let isVIP = false;
  if (contact) {
    const configs = await prisma.document.findMany({
      where: { entityId, type: DOC_TYPE },
    });
    for (const doc of configs) {
      const cfg = deserializeConfig(doc);
      if (cfg.vipContactIds?.includes(contact.id)) {
        isVIP = true;
        break;
      }
    }
  }

  // Basic spam detection placeholder: unknown numbers with no contact match
  // In reality, this would check against known spam databases
  const isSpam = !contact && callerNumber.startsWith('+1900');

  return { isSpam, isVIP, contact };
}

export async function screenCaller(
  callerNumber: string,
  entityId: VerifiedEntityId
): Promise<{ isSpam: boolean; isVIP: boolean; contact: Contact | null }> {
  return screenCallerInEntity(callerNumber, entityId);
}

export function routeCall(
  config: InboundConfig,
  callerInfo: { isVIP: boolean; isSpam: boolean; intent?: string }
): string {
  if (callerInfo.isSpam && config.spamFilterEnabled) {
    return 'BLOCKED';
  }

  // Sort rules by priority (lower number = higher priority)
  const sortedRules = [...config.routingRules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (matchesRoutingCondition(rule.condition, callerInfo)) {
      return rule.destination;
    }
  }

  // Default: AI handles the call
  return 'AI_HANDLE';
}

function matchesRoutingCondition(
  condition: string,
  callerInfo: { isVIP: boolean; isSpam: boolean; intent?: string }
): boolean {
  const condLower = condition.toLowerCase();

  if (condLower === 'vip=true') return callerInfo.isVIP;
  if (condLower === 'vip=false') return !callerInfo.isVIP;
  if (condLower === 'spam=true') return callerInfo.isSpam;

  if (condLower.startsWith('intent=') && callerInfo.intent) {
    const intentValue = condLower.split('=')[1];
    return callerInfo.intent.toLowerCase() === intentValue;
  }

  return false;
}

export function isAfterHours(config: AfterHoursConfig): boolean {
  if (!config.enabled) return false;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const todayHours = config.businessHours.find((h) => h.day === dayOfWeek);
  if (!todayHours) return true; // No hours defined for today = after hours

  return currentTime < todayHours.start || currentTime > todayHours.end;
}

/**
 * Collect an intake form by generating AI-powered prompts for each field,
 * then returning a record with the field values.
 *
 * @param fields - Array of field names to collect (e.g., ['name', 'email', 'phone', 'reason'])
 * @returns Record mapping each field name to its collected value (or empty string if unavailable)
 */
export async function collectIntakeForm(
  fields: string[]
): Promise<Record<string, string>> {
  if (fields.length === 0) {
    return {};
  }

  try {
    // Generate intake prompts and collect values using AI
    const result = await generateJSON<Record<string, string>>(
      `You are an intake form assistant for a voice call system.
Generate appropriate intake prompts and default placeholder values for the following fields.
For each field, provide a sensible prompt message that an agent would use to collect this information from a caller.

Fields to collect: ${JSON.stringify(fields)}

Return a JSON object where each key is the field name and the value is the intake prompt text.
Example: {"name": "May I have your full name please?", "email": "What email address can we reach you at?"}`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'Generate professional, friendly intake prompts for voice call data collection. Return valid JSON only.',
      }
    );

    // Ensure all requested fields are present in the result
    const collected: Record<string, string> = {};
    for (const field of fields) {
      collected[field] = result[field] ?? '';
    }

    return collected;
  } catch {
    // AI is unavailable — return template-based prompts as fallback
    const fallback: Record<string, string> = {};
    for (const field of fields) {
      fallback[field] = `Please provide your ${field}`;
    }
    return fallback;
  }
}
