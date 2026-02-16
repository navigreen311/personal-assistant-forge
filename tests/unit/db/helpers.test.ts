import {
  buildPaginationArgs,
  paginateQuery,
  buildOrderBy,
  buildWhereClause,
  withTransaction,
  softDeleteFilter,
} from '@/lib/db/helpers';
import { Prisma } from '@prisma/client';

// Mock the prisma client
jest.mock('@/lib/db/index', () => {
  const mockTransaction = jest.fn();
  return {
    prisma: {
      $transaction: mockTransaction,
    },
    __mockTransaction: mockTransaction,
  };
});

const { __mockTransaction: mockTransaction } = jest.requireMock('@/lib/db/index') as {
  __mockTransaction: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildPaginationArgs
// ---------------------------------------------------------------------------
describe('buildPaginationArgs', () => {
  it('should return defaults when no params provided', () => {
    const result = buildPaginationArgs();
    expect(result).toEqual({ skip: 0, take: 20 });
  });

  it('should calculate correct skip/take for page 1', () => {
    const result = buildPaginationArgs({ page: 1, pageSize: 10 });
    expect(result).toEqual({ skip: 0, take: 10 });
  });

  it('should calculate correct skip/take for page 3 with pageSize 10', () => {
    const result = buildPaginationArgs({ page: 3, pageSize: 10 });
    expect(result).toEqual({ skip: 20, take: 10 });
  });

  it('should cap pageSize at 100', () => {
    const result = buildPaginationArgs({ page: 1, pageSize: 500 });
    expect(result).toEqual({ skip: 0, take: 100 });
  });

  it('should treat page < 1 as page 1', () => {
    const result = buildPaginationArgs({ page: -5, pageSize: 20 });
    expect(result).toEqual({ skip: 0, take: 20 });
  });

  it('should treat page 0 as page 1', () => {
    const result = buildPaginationArgs({ page: 0 });
    expect(result).toEqual({ skip: 0, take: 20 });
  });
});

// ---------------------------------------------------------------------------
// paginateQuery
// ---------------------------------------------------------------------------
describe('paginateQuery', () => {
  it('should return correct pagination metadata', () => {
    const data = [{ id: '1' }, { id: '2' }];
    const result = paginateQuery(data, 50, { page: 1, pageSize: 20 });
    expect(result).toEqual({
      data,
      total: 50,
      page: 1,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it('should calculate totalPages correctly', () => {
    const result = paginateQuery([], 101, { page: 1, pageSize: 10 });
    expect(result.totalPages).toBe(11);
  });

  it('should handle empty results', () => {
    const result = paginateQuery([], 0, { page: 1, pageSize: 20 });
    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
  });

  it('should handle last page with fewer items', () => {
    const data = [{ id: '1' }];
    const result = paginateQuery(data, 21, { page: 2, pageSize: 20 });
    expect(result).toEqual({
      data,
      total: 21,
      page: 2,
      pageSize: 20,
      totalPages: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// softDeleteFilter
// ---------------------------------------------------------------------------
describe('softDeleteFilter', () => {
  it('should return deletedAt null filter', () => {
    expect(softDeleteFilter()).toEqual({ deletedAt: null });
  });
});

// ---------------------------------------------------------------------------
// buildOrderBy
// ---------------------------------------------------------------------------
describe('buildOrderBy', () => {
  it('should parse "createdAt:desc" correctly', () => {
    const result = buildOrderBy('createdAt:desc');
    expect(result).toEqual([{ createdAt: 'desc' }]);
  });

  it('should parse multiple sort fields "name:asc,createdAt:desc"', () => {
    const result = buildOrderBy('name:asc,createdAt:desc');
    expect(result).toEqual([{ name: 'asc' }, { createdAt: 'desc' }]);
  });

  it('should return empty array for undefined input', () => {
    const result = buildOrderBy(undefined);
    expect(result).toEqual([]);
  });

  it('should filter out disallowed fields when allowedFields provided', () => {
    const result = buildOrderBy('name:asc,secretField:desc,createdAt:desc', ['name', 'createdAt']);
    expect(result).toEqual([{ name: 'asc' }, { createdAt: 'desc' }]);
  });

  it('should default to asc when direction not specified', () => {
    const result = buildOrderBy('name');
    expect(result).toEqual([{ name: 'asc' }]);
  });

  it('should handle empty string', () => {
    const result = buildOrderBy('');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildWhereClause
// ---------------------------------------------------------------------------
describe('buildWhereClause', () => {
  it('should handle string equality filters', () => {
    const result = buildWhereClause({ status: 'ACTIVE', name: 'test' });
    expect(result).toEqual({ status: 'ACTIVE', name: 'test' });
  });

  it('should handle array "in" filters', () => {
    const result = buildWhereClause({ status: ['ACTIVE', 'PAUSED'] });
    expect(result).toEqual({ status: { in: ['ACTIVE', 'PAUSED'] } });
  });

  it('should ignore undefined/null filter values', () => {
    const result = buildWhereClause({ status: 'ACTIVE', name: undefined, age: null });
    expect(result).toEqual({ status: 'ACTIVE' });
  });

  it('should handle nested object filters', () => {
    const result = buildWhereClause({
      createdAt: { gte: new Date('2024-01-01') },
    });
    expect(result).toEqual({
      createdAt: { gte: new Date('2024-01-01') },
    });
  });

  it('should handle numeric filters', () => {
    const result = buildWhereClause({ score: 85 });
    expect(result).toEqual({ score: 85 });
  });
});

// ---------------------------------------------------------------------------
// withTransaction
// ---------------------------------------------------------------------------
describe('withTransaction', () => {
  it('should execute function within a transaction', async () => {
    const mockResult = { id: '1', name: 'test' };
    mockTransaction.mockImplementation(async (fn: Function) => fn('tx'));

    const fn = jest.fn().mockResolvedValue(mockResult);
    const result = await withTransaction(fn);

    expect(result).toEqual(mockResult);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('tx');
  });

  it('should retry on serialization failure up to maxRetries', async () => {
    const serializationError = new Prisma.PrismaClientKnownRequestError('Serialization failure', {
      code: 'P2034',
      clientVersion: '7.0.0',
    });

    mockTransaction
      .mockRejectedValueOnce(serializationError)
      .mockRejectedValueOnce(serializationError)
      .mockImplementation(async (fn: Function) => fn('tx'));

    const fn = jest.fn().mockResolvedValue('success');
    const result = await withTransaction(fn, 3);

    expect(result).toBe('success');
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting retries', async () => {
    const serializationError = new Prisma.PrismaClientKnownRequestError('Serialization failure', {
      code: 'P2034',
      clientVersion: '7.0.0',
    });

    mockTransaction.mockRejectedValue(serializationError);

    await expect(withTransaction(jest.fn(), 2)).rejects.toThrow();
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('should throw immediately for non-serialization errors', async () => {
    const otherError = new Error('Connection lost');
    mockTransaction.mockRejectedValue(otherError);

    await expect(withTransaction(jest.fn(), 3)).rejects.toThrow('Connection lost');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
