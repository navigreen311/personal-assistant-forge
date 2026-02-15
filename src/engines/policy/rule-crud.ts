import { prisma } from '@/lib/db';
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
      condition: data.condition as Record<string, unknown>,
      action: data.action as Record<string, unknown>,
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

  const rule = await prisma.rule.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.scope !== undefined && { scope: data.scope }),
      ...(data.entityId !== undefined && { entityId: data.entityId }),
      ...(data.condition !== undefined && { condition: data.condition as Record<string, unknown> }),
      ...(data.action !== undefined && { action: data.action as Record<string, unknown> }),
      ...(data.precedence !== undefined && { precedence: data.precedence }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      version: existing.version + 1,
    },
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
      condition: (overrides?.condition ?? existing.condition) as Record<string, unknown>,
      action: (overrides?.action ?? existing.action) as Record<string, unknown>,
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
