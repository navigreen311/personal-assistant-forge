// ============================================================================
// VoiceForge — Number Management Service
// Provision, release, and manage phone numbers
// ============================================================================

import { prisma } from '@/lib/db';
import { MockVoiceProvider } from '@/lib/voice/mock-provider';
import type { ManagedNumber } from '@/modules/voiceforge/types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

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
  entityId: VerifiedEntityId,
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

export async function releaseNumber(
  numberId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const num = await getNumber(numberId, entityId);
  if (!num) throw new Error(`Number ${numberId} not found`);

  await provider.releaseNumber(num.phoneNumber);

  const updated: Omit<ManagedNumber, 'id'> = { ...num, status: 'RELEASED' };
  const res = await prisma.document.updateMany({
    where: { id: numberId, type: DOC_TYPE, entityId },
    data: {
      content: serializeNumber(updated),
      status: 'ARCHIVED',
    },
  });
  if (res.count === 0) throw new Error(`Number ${numberId} not found`);
}

export async function getNumber(
  numberId: string,
  entityId: VerifiedEntityId
): Promise<ManagedNumber | null> {
  const doc = await prisma.document.findFirst({
    where: { id: numberId, type: DOC_TYPE, entityId },
  });
  if (!doc) return null;
  return deserializeNumber(doc);
}

export async function listNumbers(entityId: VerifiedEntityId): Promise<ManagedNumber[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOC_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(deserializeNumber);
}

export async function assignPersona(
  numberId: string,
  entityId: VerifiedEntityId,
  personaId: string
): Promise<ManagedNumber> {
  const num = await getNumber(numberId, entityId);
  if (!num) throw new Error(`Number ${numberId} not found`);

  const updated: Omit<ManagedNumber, 'id'> = { ...num, assignedPersonaId: personaId };
  const res = await prisma.document.updateMany({
    where: { id: numberId, type: DOC_TYPE, entityId },
    data: { content: serializeNumber(updated) },
  });
  if (res.count === 0) throw new Error(`Number ${numberId} not found`);

  return { ...num, assignedPersonaId: personaId };
}

export async function assignInboundConfig(
  numberId: string,
  entityId: VerifiedEntityId,
  configId: string
): Promise<ManagedNumber> {
  const num = await getNumber(numberId, entityId);
  if (!num) throw new Error(`Number ${numberId} not found`);

  const updated: Omit<ManagedNumber, 'id'> = { ...num, inboundConfigId: configId };
  const res = await prisma.document.updateMany({
    where: { id: numberId, type: DOC_TYPE, entityId },
    data: { content: serializeNumber(updated) },
  });
  if (res.count === 0) throw new Error(`Number ${numberId} not found`);

  return { ...num, inboundConfigId: configId };
}
