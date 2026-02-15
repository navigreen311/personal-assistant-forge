import { prisma } from '@/lib/db';
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

function toStoredData(sop: Partial<SOP> & Pick<SOP, 'title' | 'description' | 'steps' | 'triggerConditions' | 'status'>): string {
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
  data: Omit<SOP, 'id' | 'version' | 'useCount' | 'createdAt' | 'updatedAt'>
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
      entityId: data.entityId,
      type: 'SOP',
      version: 1,
      content: JSON.stringify(sopData),
      status: data.status === 'ACTIVE' ? 'APPROVED' : 'DRAFT',
      citations: [],
    },
  });

  return toSOP(doc as unknown as Record<string, unknown>);
}

export async function getSOP(id: string): Promise<SOP | null> {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return null;
  return toSOP(doc as unknown as Record<string, unknown>);
}

export async function listSOPs(
  entityId: string,
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

export async function updateSOP(id: string, data: Partial<SOP>): Promise<SOP> {
  const existing = await getSOP(id);
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

  const doc = await prisma.document.update({
    where: { id },
    data: {
      title: updated.title,
      version: newVersion,
      content: JSON.stringify(sopData),
      status: updated.status === 'ACTIVE' ? 'APPROVED' : updated.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT',
    },
  });

  return toSOP(doc as unknown as Record<string, unknown>);
}

export async function matchSOPToContext(context: string, entityId: string): Promise<SOP[]> {
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

export async function recordUsage(id: string): Promise<void> {
  const existing = await getSOP(id);
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

  await prisma.document.update({
    where: { id },
    data: { content: JSON.stringify(sopData) },
  });
}
