import type { Entity } from '@prisma/client';
import { prisma } from './index';
import {
  type PaginationParams,
  type PaginatedResult,
  buildPaginationArgs,
  paginateQuery,
} from './helpers';

/**
 * Find an entity with ownership verification.
 * Returns the entity only if the given user owns it.
 */
export async function findEntityForUser(
  entityId: string,
  userId: string,
): Promise<Entity | null> {
  return prisma.entity.findFirst({
    where: { id: entityId, userId },
  });
}

/**
 * Find records scoped to an entity with pagination.
 */
export async function findByEntity<T>(
  model: string,
  entityId: string,
  params?: PaginationParams,
): Promise<PaginatedResult<T>> {
  const delegate = (prisma as unknown as Record<string, unknown>)[model] as
    | Record<string, (...args: unknown[]) => unknown>
    | undefined;
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new Error(`Model "${model}" not found on Prisma client`);
  }

  const pagination = buildPaginationArgs(params);
  const where = { entityId };

  const [data, total] = await Promise.all([
    delegate.findMany({ where, ...pagination, orderBy: { createdAt: 'desc' } }),
    delegate.count({ where }),
  ]);

  return paginateQuery<T>(data as T[], total as number, params);
}

/**
 * Count records grouped by status within an entity.
 */
export async function countByStatus(
  model: string,
  entityId: string,
): Promise<Record<string, number>> {
  const delegate = (prisma as unknown as Record<string, unknown>)[model] as
    | Record<string, (...args: unknown[]) => unknown>
    | undefined;
  if (!delegate || typeof delegate.groupBy !== 'function') {
    throw new Error(`Model "${model}" not found on Prisma client`);
  }

  const groups = (await delegate.groupBy({
    by: ['status'],
    where: { entityId },
    _count: { _all: true },
  })) as Array<{ status: string; _count: { _all: number } }>;

  const result: Record<string, number> = {};
  for (const group of groups) {
    result[group.status] = group._count._all;
  }
  return result;
}

/**
 * Full-text search across specified fields within an optional entity scope.
 */
export async function textSearch(
  model: string,
  query: string,
  fields: string[],
  entityId?: string,
): Promise<unknown[]> {
  const delegate = (prisma as unknown as Record<string, unknown>)[model] as
    | Record<string, (...args: unknown[]) => unknown>
    | undefined;
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new Error(`Model "${model}" not found on Prisma client`);
  }

  const orConditions = fields.map((field) => ({
    [field]: { contains: query, mode: 'insensitive' as const },
  }));

  const where: Record<string, unknown> = { OR: orConditions };
  if (entityId) {
    where.entityId = entityId;
  }

  return delegate.findMany({ where, take: 50 }) as Promise<unknown[]>;
}
