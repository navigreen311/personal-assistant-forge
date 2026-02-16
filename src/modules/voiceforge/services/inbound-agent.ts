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

export async function collectIntakeForm(
  _fields: string[]
): Promise<Record<string, string>> {
  // Placeholder: returns empty record
  return {};
}
