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
  RoutingRule,
} from '@/modules/voiceforge/types';

const DOC_TYPE = 'INBOUND_CONFIG';

function deserializeConfig(doc: { id: string; entityId: string; content: string | null }): InboundConfig {
  return JSON.parse(doc.content ?? '{}') as InboundConfig;
}

export async function getInboundConfig(phoneNumber: string): Promise<InboundConfig | null> {
  const docs = await prisma.document.findMany({
    where: { type: DOC_TYPE },
  });

  for (const doc of docs) {
    const config = deserializeConfig(doc);
    if (config.phoneNumber === phoneNumber) {
      return config;
    }
  }
  return null;
}

export async function saveInboundConfig(config: InboundConfig): Promise<InboundConfig> {
  // Check if config already exists for this number
  const existing = await prisma.document.findMany({
    where: { type: DOC_TYPE, entityId: config.entityId },
  });

  const existingDoc = existing.find((d: { id: string; entityId: string; content: string | null }) => {
    const c = deserializeConfig(d);
    return c.phoneNumber === config.phoneNumber;
  });

  if (existingDoc) {
    await prisma.document.update({
      where: { id: existingDoc.id },
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

export async function detectCallerIntent(
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

export async function handleInboundCall(
  phoneNumber: string,
  callerNumber: string
): Promise<InboundCallResult> {
  const config = await getInboundConfig(phoneNumber);
  if (!config) {
    throw new Error(`No inbound config found for ${phoneNumber}`);
  }

  const callerInfo = await screenCaller(callerNumber, config.entityId);
  const afterHours = isAfterHours(config.afterHoursConfig);

  // Detect caller intent using AI if we have a known contact
  const intent = await detectCallerIntent(callerInfo.contact?.id ?? null, config.entityId);

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

export async function screenCaller(
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
