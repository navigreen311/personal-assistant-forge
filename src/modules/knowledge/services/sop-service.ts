import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { SOP, StoredSOPData } from '@/modules/knowledge/types';

function toSOP(doc: Record<string, unknown>): SOP {
  const data = JSON.parse(doc.content as string) as StoredSOPData;
  return {
    id: doc.id as string,
    entityId: doc.entityId as string,
    title: data.title,
    description: data.description,
    steps: data.steps,
    triggerConditions: data.triggerConditions,
    tags: (doc as unknown as { tags?: string[] }).tags || [],
    version: doc.version as number,
    status: data.status,
    lastUsed: data.lastUsed ? new Date(data.lastUsed) : undefined,
    useCount: data.useCount,
    createdAt: new Date(doc.createdAt as string),
    updatedAt: new Date(doc.updatedAt as string),
  };
}

function _toStoredData(sop: Partial<SOP> & Pick<SOP, 'title' | 'description' | 'steps' | 'triggerConditions' | 'status'>): string {
  const stored: StoredSOPData = {
    title: sop.title,
    description: sop.description,
    steps: sop.steps,
    triggerConditions: sop.triggerConditions,
    status: sop.status,
    lastUsed: sop.lastUsed?.toISOString(),
    useCount: sop.useCount || 0,
  };
  return JSON.stringify(stored);
}

export async function createSOP(
  data: Omit<SOP, 'id' | 'entityId' | 'version' | 'useCount' | 'createdAt' | 'updatedAt'>,
  entityId: VerifiedEntityId
): Promise<SOP> {
  const sopData: StoredSOPData = {
    title: data.title,
    description: data.description,
    steps: data.steps,
    triggerConditions: data.triggerConditions,
    status: data.status,
    lastUsed: data.lastUsed?.toISOString(),
    useCount: 0,
  };

  const doc = await prisma.document.create({
    data: {
      title: data.title,
      // From the verified scope, never from the caller's payload.
      entityId,
      type: 'SOP',
      version: 1,
      content: JSON.stringify(sopData),
      status: data.status === 'ACTIVE' ? 'APPROVED' : 'DRAFT',
      citations: [],
    },
  });

  return toSOP(doc as unknown as Record<string, unknown>);
}

export async function getSOP(id: string, entityId: VerifiedEntityId): Promise<SOP | null> {
  // Scope in the WHERE: another tenant's SOP is not found, so there is no
  // check-then-act for a later edit to forget.
  const doc = await prisma.document.findFirst({ where: { id, entityId, type: 'SOP' } });
  if (!doc) return null;
  return toSOP(doc as unknown as Record<string, unknown>);
}

export async function listSOPs(
  entityId: VerifiedEntityId,
  filters: { status?: string; tags?: string[] }
): Promise<SOP[]> {
  const docs = await prisma.document.findMany({
    where: {
      entityId,
      type: 'SOP',
    },
  });

  let sops = docs.map((doc: unknown) => toSOP(doc as unknown as Record<string, unknown>));

  if (filters.status) {
    sops = sops.filter((s: SOP) => s.status === filters.status);
  }

  if (filters.tags && filters.tags.length > 0) {
    sops = sops.filter((s: SOP) =>
      filters.tags!.some((t: string) => s.tags.includes(t) || s.triggerConditions.some((tc: string) => tc.toLowerCase().includes(t.toLowerCase())))
    );
  }

  return sops;
}

export async function updateSOP(
  id: string,
  entityId: VerifiedEntityId,
  data: Partial<Omit<SOP, 'entityId'>>
): Promise<SOP> {
  const existing = await getSOP(id, entityId);
  if (!existing) throw new Error(`SOP ${id} not found`);

  const updated = { ...existing, ...data };
  const newVersion = existing.version + 1;

  const sopData: StoredSOPData = {
    title: updated.title,
    description: updated.description,
    steps: updated.steps,
    triggerConditions: updated.triggerConditions,
    status: updated.status,
    lastUsed: updated.lastUsed?.toISOString(),
    useCount: updated.useCount,
  };

  // updateMany, not update: a unique WHERE cannot carry the entity.
  const result = await prisma.document.updateMany({
    where: { id, entityId, type: 'SOP' },
    data: {
      title: updated.title,
      version: newVersion,
      content: JSON.stringify(sopData),
      status: updated.status === 'ACTIVE' ? 'APPROVED' : updated.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT',
    },
  });
  if (result.count === 0) throw new Error(`SOP ${id} not found`);

  const doc = await prisma.document.findFirst({ where: { id, entityId } });
  if (!doc) throw new Error(`SOP ${id} not found`);

  return toSOP(doc as unknown as Record<string, unknown>);
}

export async function matchSOPToContext(
  context: string,
  entityId: VerifiedEntityId
): Promise<SOP[]> {
  const sops = await listSOPs(entityId, { status: 'ACTIVE' });
  const contextKeywords = context
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  return sops.filter((sop) =>
    sop.triggerConditions.some((condition) => {
      const conditionLower = condition.toLowerCase();
      return contextKeywords.some((kw) => conditionLower.includes(kw));
    })
  );
}

export async function recordUsage(id: string, entityId: VerifiedEntityId): Promise<void> {
  const existing = await getSOP(id, entityId);
  if (!existing) throw new Error(`SOP ${id} not found`);

  const sopData: StoredSOPData = {
    title: existing.title,
    description: existing.description,
    steps: existing.steps,
    triggerConditions: existing.triggerConditions,
    status: existing.status,
    lastUsed: new Date().toISOString(),
    useCount: existing.useCount + 1,
  };

  const result = await prisma.document.updateMany({
    where: { id, entityId, type: 'SOP' },
    data: { content: JSON.stringify(sopData) },
  });
  if (result.count === 0) throw new Error(`SOP ${id} not found`);
}
