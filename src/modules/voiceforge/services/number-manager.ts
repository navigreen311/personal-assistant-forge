// ============================================================================
// VoiceForge — Number Management Service
// Provision, release, and manage phone numbers
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { MockVoiceProvider } from '@/lib/voice/mock-provider';
import type { ManagedNumber } from '@/modules/voiceforge/types';

const DOC_TYPE = 'MANAGED_NUMBER';
const provider = new MockVoiceProvider({ delay: 0 });

function deserializeNumber(doc: { id: string; entityId: string; content: string | null; createdAt: Date }): ManagedNumber {
  const data = JSON.parse(doc.content ?? '{}');
  return {
    id: doc.id,
    entityId: doc.entityId,
    phoneNumber: data.phoneNumber ?? '',
    label: data.label ?? '',
    provider: data.provider ?? 'mock',
    capabilities: data.capabilities ?? ['VOICE'],
    status: data.status ?? 'ACTIVE',
    monthlyRate: data.monthlyRate ?? 0,
    assignedPersonaId: data.assignedPersonaId,
    inboundConfigId: data.inboundConfigId,
    provisionedAt: data.provisionedAt ? new Date(data.provisionedAt) : doc.createdAt,
  };
}

function serializeNumber(data: Omit<ManagedNumber, 'id'>): string {
  return JSON.stringify({
    phoneNumber: data.phoneNumber,
    label: data.label,
    provider: data.provider,
    capabilities: data.capabilities,
    status: data.status,
    monthlyRate: data.monthlyRate,
    assignedPersonaId: data.assignedPersonaId,
    inboundConfigId: data.inboundConfigId,
    provisionedAt: data.provisionedAt,
  });
}

export async function provisionNumber(
  entityId: string,
  areaCode: string,
  label: string
): Promise<ManagedNumber> {
  const provisioned = await provider.provisionNumber(areaCode);

  const numberData: Omit<ManagedNumber, 'id'> = {
    entityId,
    phoneNumber: provisioned.phoneNumber,
    label,
    provider: 'mock',
    capabilities: provisioned.capabilities,
    status: 'ACTIVE',
    monthlyRate: provisioned.monthlyRate,
    provisionedAt: provisioned.provisionedAt,
  };

  const doc = await prisma.document.create({
    data: {
      title: `${label} (${provisioned.phoneNumber})`,
      entityId,
      type: DOC_TYPE,
      content: serializeNumber(numberData),
      status: 'APPROVED',
    },
  });

  return deserializeNumber(doc);
}

export async function releaseNumber(numberId: string): Promise<void> {
  const num = await getNumber(numberId);
  if (!num) throw new Error(`Number ${numberId} not found`);

  await provider.releaseNumber(num.phoneNumber);

  const updated: Omit<ManagedNumber, 'id'> = { ...num, status: 'RELEASED' };
  await prisma.document.update({
    where: { id: numberId },
    data: {
      content: serializeNumber(updated),
      status: 'ARCHIVED',
    },
  });
}

export async function getNumber(numberId: string): Promise<ManagedNumber | null> {
  const doc = await prisma.document.findFirst({
    where: { id: numberId, type: DOC_TYPE },
  });
  if (!doc) return null;
  return deserializeNumber(doc);
}

export async function listNumbers(entityId: string): Promise<ManagedNumber[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOC_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(deserializeNumber);
}

export async function assignPersona(
  numberId: string,
  personaId: string
): Promise<ManagedNumber> {
  const num = await getNumber(numberId);
  if (!num) throw new Error(`Number ${numberId} not found`);

  const updated: Omit<ManagedNumber, 'id'> = { ...num, assignedPersonaId: personaId };
  await prisma.document.update({
    where: { id: numberId },
    data: { content: serializeNumber(updated) },
  });

  return { ...num, assignedPersonaId: personaId };
}

export async function assignInboundConfig(
  numberId: string,
  configId: string
): Promise<ManagedNumber> {
  const num = await getNumber(numberId);
  if (!num) throw new Error(`Number ${numberId} not found`);

  const updated: Omit<ManagedNumber, 'id'> = { ...num, inboundConfigId: configId };
  await prisma.document.update({
    where: { id: numberId },
    data: { content: serializeNumber(updated) },
  });

  return { ...num, inboundConfigId: configId };
}
