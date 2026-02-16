// ============================================================================
// VoiceForge — Persona Library Service
// CRUD operations for voice personas with consent chain management
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type {
  VoicePersona,
  ConsentChainEntry,
} from '@/modules/voiceforge/types';
import { generateJSON } from '@/lib/ai';

const DOC_TYPE = 'VOICE_PERSONA';

function deserializePersona(doc: { id: string; entityId: string; content: string | null; createdAt: Date; updatedAt: Date }): VoicePersona {
  const data = JSON.parse(doc.content ?? '{}');
  return {
    id: doc.id,
    entityId: doc.entityId,
    name: data.name ?? '',
    description: data.description ?? '',
    voiceConfig: data.voiceConfig ?? {},
    personality: data.personality ?? {},
    status: data.status ?? 'DRAFT',
    consentChain: (data.consentChain ?? []).map((e: ConsentChainEntry) => ({
      ...e,
      grantedAt: new Date(e.grantedAt),
      revokedAt: e.revokedAt ? new Date(e.revokedAt) : undefined,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializePersona(persona: Omit<VoicePersona, 'id' | 'createdAt' | 'updatedAt'>): string {
  return JSON.stringify({
    name: persona.name,
    description: persona.description,
    voiceConfig: persona.voiceConfig,
    personality: persona.personality,
    status: persona.status,
    consentChain: persona.consentChain,
  });
}

export async function createPersona(
  data: Omit<VoicePersona, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VoicePersona> {
  const doc = await prisma.document.create({
    data: {
      title: data.name,
      entityId: data.entityId,
      type: DOC_TYPE,
      content: serializePersona(data),
      status: data.status,
    },
  });
  return deserializePersona(doc);
}

export async function getPersona(id: string): Promise<VoicePersona | null> {
  const doc = await prisma.document.findFirst({
    where: { id, type: DOC_TYPE },
  });
  if (!doc) return null;
  return deserializePersona(doc);
}

export async function listPersonas(entityId: string): Promise<VoicePersona[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOC_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(deserializePersona);
}

export async function updatePersona(
  id: string,
  data: Partial<VoicePersona>
): Promise<VoicePersona> {
  const existing = await getPersona(id);
  if (!existing) throw new Error(`Persona ${id} not found`);

  const merged = {
    ...existing,
    ...data,
    id: existing.id,
    entityId: existing.entityId,
    createdAt: existing.createdAt,
  };

  const doc = await prisma.document.update({
    where: { id },
    data: {
      title: merged.name,
      content: serializePersona(merged),
      status: merged.status,
    },
  });
  return deserializePersona(doc);
}

export async function addConsentEntry(
  personaId: string,
  entry: Omit<ConsentChainEntry, 'id'>
): Promise<ConsentChainEntry> {
  const persona = await getPersona(personaId);
  if (!persona) throw new Error(`Persona ${personaId} not found`);

  const newEntry: ConsentChainEntry = {
    id: uuidv4(),
    ...entry,
  };

  persona.consentChain.push(newEntry);
  await updatePersona(personaId, { consentChain: persona.consentChain });
  return newEntry;
}

export async function revokeConsent(
  personaId: string,
  entryId: string
): Promise<void> {
  const persona = await getPersona(personaId);
  if (!persona) throw new Error(`Persona ${personaId} not found`);

  const entry = persona.consentChain.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Consent entry ${entryId} not found`);

  entry.status = 'REVOKED';
  entry.revokedAt = new Date();

  await updatePersona(personaId, { consentChain: persona.consentChain });
}

export async function validateConsentChain(
  personaId: string
): Promise<{ valid: boolean; issues: string[] }> {
  const persona = await getPersona(personaId);
  if (!persona) return { valid: false, issues: ['Persona not found'] };

  const issues: string[] = [];

  if (persona.consentChain.length === 0) {
    issues.push('No consent entries in chain');
  }

  for (const entry of persona.consentChain) {
    if (entry.status === 'REVOKED') {
      issues.push(`Consent entry ${entry.id} has been revoked`);
    }
    if (entry.status === 'EXPIRED') {
      issues.push(`Consent entry ${entry.id} has expired`);
    }
    if (entry.status === 'PENDING') {
      issues.push(`Consent entry ${entry.id} is still pending`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function generateWatermarkId(): string {
  return `WM-${uuidv4()}`;
}

export async function suggestPersonaTraits(
  brandDescription: string,
  targetAudience: string,
  campaignContext?: string,
): Promise<{
  personality: {
    tone: string;
    formality: number;
    empathy: number;
    assertiveness: number;
    humor: number;
    vocabularyLevel: string;
  };
  reasoning: string;
}> {
  try {
    const result = await generateJSON<{
      personality: {
        tone: string;
        formality: number;
        empathy: number;
        assertiveness: number;
        humor: number;
        vocabularyLevel: string;
      };
      reasoning: string;
    }>(`Suggest voice persona personality traits for the following context.

Brand description: ${brandDescription}
Target audience: ${targetAudience}
Campaign context: ${campaignContext ?? 'General outreach'}

Return JSON with:
- personality: { tone (WARM/PROFESSIONAL/FRIENDLY/AUTHORITATIVE), formality (0-1), empathy (0-1), assertiveness (0-1), humor (0-1), vocabularyLevel (SIMPLE/MODERATE/ADVANCED) }
- reasoning: brief explanation of why these traits fit`, {
      maxTokens: 512,
      temperature: 0.5,
      system: 'You are a brand voice strategist. Recommend persona traits that align with brand identity and resonate with the target audience.',
    });

    return result;
  } catch {
    return {
      personality: {
        tone: 'PROFESSIONAL',
        formality: 0.6,
        empathy: 0.7,
        assertiveness: 0.5,
        humor: 0.3,
        vocabularyLevel: 'MODERATE',
      },
      reasoning: 'Default professional persona (AI suggestion unavailable)',
    };
  }
}
