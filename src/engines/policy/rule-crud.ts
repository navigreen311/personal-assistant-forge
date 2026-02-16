import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { Rule } from '@/shared/types';
import type { RuleScope } from './types';

export async function createRule(
  data: Omit<Rule, 'id' | 'createdAt' | 'updatedAt' | 'version'>
): Promise<Rule> {
  const rule = await prisma.rule.create({
    data: {
      name: data.name,
      scope: data.scope,
      entityId: data.entityId,
      condition: data.condition as unknown as Prisma.InputJsonValue,
      action: data.action as unknown as Prisma.InputJsonValue,
      precedence: data.precedence,
      createdBy: data.createdBy,
      isActive: data.isActive,
      version: 1,
    },
  });

  return mapPrismaRule(rule);
}

export async function updateRule(id: string, data: Partial<Rule>): Promise<Rule> {
  const existing = await prisma.rule.findUnique({ where: { id } });
  if (!existing) throw new Error(`Rule not found: ${id}`);

  const updateData: Prisma.RuleUncheckedUpdateInput = {
    version: existing.version + 1,
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.scope !== undefined) updateData.scope = data.scope;
  if (data.entityId !== undefined) updateData.entityId = data.entityId;
  if (data.condition !== undefined) updateData.condition = data.condition as unknown as Prisma.InputJsonValue;
  if (data.action !== undefined) updateData.action = data.action as unknown as Prisma.InputJsonValue;
  if (data.precedence !== undefined) updateData.precedence = data.precedence;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const rule = await prisma.rule.update({
    where: { id },
    data: updateData,
  });

  return mapPrismaRule(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await prisma.rule.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function listRules(
  filters: { scope?: RuleScope; entityId?: string; isActive?: boolean },
  page = 1,
  pageSize = 20
): Promise<{ data: Rule[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (filters.scope !== undefined) where.scope = filters.scope;
  if (filters.entityId !== undefined) where.entityId = filters.entityId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  const [rules, total] = await Promise.all([
    prisma.rule.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { precedence: 'desc' },
    }),
    prisma.rule.count({ where }),
  ]);

  return { data: rules.map(mapPrismaRule), total };
}

export async function getRuleById(id: string): Promise<Rule | null> {
  const rule = await prisma.rule.findUnique({ where: { id } });
  return rule ? mapPrismaRule(rule) : null;
}

export async function duplicateRule(
  id: string,
  overrides?: Partial<Rule>
): Promise<Rule> {
  const existing = await prisma.rule.findUnique({ where: { id } });
  if (!existing) throw new Error(`Rule not found: ${id}`);

  const rule = await prisma.rule.create({
    data: {
      name: overrides?.name ?? `${existing.name} (copy)`,
      scope: overrides?.scope ?? existing.scope,
      entityId: overrides?.entityId ?? existing.entityId,
      condition: (overrides?.condition ?? existing.condition) as unknown as Prisma.InputJsonValue,
      action: (overrides?.action ?? existing.action) as unknown as Prisma.InputJsonValue,
      precedence: overrides?.precedence ?? existing.precedence,
      createdBy: overrides?.createdBy ?? existing.createdBy,
      isActive: overrides?.isActive ?? true,
      version: 1,
    },
  });

  return mapPrismaRule(rule);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPrismaRule(raw: any): Rule {
  return {
    id: raw.id,
    name: raw.name,
    scope: raw.scope,
    entityId: raw.entityId ?? undefined,
    condition: raw.condition as Record<string, unknown>,
    action: raw.action as Record<string, unknown>,
    precedence: raw.precedence,
    createdBy: raw.createdBy,
    version: raw.version,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
