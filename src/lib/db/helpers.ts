import { Prisma } from '@prisma/client';
import { prisma } from './index';

// --- Pagination ---

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function buildPaginationArgs(params: PaginationParams = {}): { skip: number; take: number } {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function paginateQuery<T>(
  data: T[],
  total: number,
  params: PaginationParams = {},
): PaginatedResult<T> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// --- Soft Delete ---

export function softDeleteFilter(): { deletedAt: null } {
  return { deletedAt: null };
}

// --- Transaction Wrapper ---

export type PrismaTransactionClient = Prisma.TransactionClient;

const SERIALIZATION_ERROR_CODE = 'P2034';

export async function withTransaction<T>(
  fn: (tx: PrismaTransactionClient) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let attempts = 0;
  while (true) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      attempts++;
      const isPrismaError =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === SERIALIZATION_ERROR_CODE;
      if (!isPrismaError || attempts >= maxRetries) {
        throw error;
      }
    }
  }
}

// --- Bulk Upsert ---

export async function bulkUpsert<T extends Record<string, unknown>>(
  model: string,
  records: T[],
  uniqueField: string,
): Promise<number> {
  const delegate = (prisma as unknown as Record<string, unknown>)[model] as Record<string, (...args: unknown[]) => unknown> | undefined;
  if (!delegate || typeof delegate.upsert !== 'function') {
    throw new Error(`Model "${model}" not found on Prisma client`);
  }

  let count = 0;
  for (const record of records) {
    await delegate.upsert({
      where: { [uniqueField]: record[uniqueField] },
      update: record,
      create: record,
    });
    count++;
  }
  return count;
}

// --- Order By Builder ---

export function buildOrderBy(
  sortString?: string,
  allowedFields?: string[],
): Record<string, 'asc' | 'desc'>[] {
  if (!sortString) return [];

  return sortString
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, direction] = part.split(':');
      const dir = direction?.toLowerCase() === 'desc' ? 'desc' : 'asc';
      return { field: field.trim(), dir };
    })
    .filter(({ field }) => {
      if (!allowedFields) return true;
      return allowedFields.includes(field);
    })
    .map(({ field, dir }) => ({ [field]: dir }) as Record<string, 'asc' | 'desc'>);
}

// --- Where Clause Builder ---

export function buildWhereClause(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      where[key] = { in: value };
    } else if (typeof value === 'object' && value !== null) {
      where[key] = value;
    } else {
      where[key] = value;
    }
  }

  return where;
}
