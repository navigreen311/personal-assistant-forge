import { findEntityForUser, findByEntity, countByStatus, textSearch } from '@/lib/db/queries';

// Mock the prisma client
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockGroupBy = jest.fn();

jest.mock('@/lib/db/index', () => ({
  prisma: {
    entity: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    task: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
    contact: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findEntityForUser
// ---------------------------------------------------------------------------
describe('findEntityForUser', () => {
  it('should return entity when user owns it', async () => {
    const mockEntity = { id: 'entity-1', userId: 'user-1', name: 'MedLink Pro' };
    mockFindFirst.mockResolvedValue(mockEntity);

    const result = await findEntityForUser('entity-1', 'user-1');

    expect(result).toEqual(mockEntity);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'entity-1', userId: 'user-1' },
    });
  });

  it('should return null when user does not own entity', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findEntityForUser('entity-1', 'other-user');

    expect(result).toBeNull();
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'entity-1', userId: 'other-user' },
    });
  });

  it('should return null for non-existent entity', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findEntityForUser('non-existent', 'user-1');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findByEntity
// ---------------------------------------------------------------------------
describe('findByEntity', () => {
  it('should return paginated results for an entity', async () => {
    const mockData = [
      { id: '1', title: 'Task 1' },
      { id: '2', title: 'Task 2' },
    ];
    mockFindMany.mockResolvedValue(mockData);
    mockCount.mockResolvedValue(25);

    const result = await findByEntity('task', 'entity-1');

    expect(result.data).toEqual(mockData);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(2);
  });

  it('should apply pagination parameters', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(50);

    const result = await findByEntity('task', 'entity-1', { page: 3, pageSize: 10 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { entityId: 'entity-1' },
      skip: 20,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
  });

  it('should return empty results for entity with no records', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await findByEntity('task', 'empty-entity');

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('should throw for invalid model name', async () => {
    await expect(findByEntity('nonExistentModel', 'entity-1')).rejects.toThrow(
      'Model "nonExistentModel" not found on Prisma client'
    );
  });
});

// ---------------------------------------------------------------------------
// countByStatus
// ---------------------------------------------------------------------------
describe('countByStatus', () => {
  it('should return status counts for entity', async () => {
    mockGroupBy.mockResolvedValue([
      { status: 'TODO', _count: { _all: 5 } },
      { status: 'IN_PROGRESS', _count: { _all: 3 } },
      { status: 'DONE', _count: { _all: 10 } },
    ]);

    const result = await countByStatus('task', 'entity-1');

    expect(result).toEqual({
      TODO: 5,
      IN_PROGRESS: 3,
      DONE: 10,
    });
    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { entityId: 'entity-1' },
      _count: { _all: true },
    });
  });

  it('should return empty object for entity with no records', async () => {
    mockGroupBy.mockResolvedValue([]);

    const result = await countByStatus('task', 'empty-entity');

    expect(result).toEqual({});
  });

  it('should throw for invalid model name', async () => {
    await expect(countByStatus('nonExistentModel', 'entity-1')).rejects.toThrow(
      'Model "nonExistentModel" not found on Prisma client'
    );
  });
});

// ---------------------------------------------------------------------------
// textSearch
// ---------------------------------------------------------------------------
describe('textSearch', () => {
  it('should search across specified fields', async () => {
    const mockResults = [{ id: '1', title: 'EHR Integration' }];
    mockFindMany.mockResolvedValue(mockResults);

    const result = await textSearch('task', 'EHR', ['title', 'description']);

    expect(result).toEqual(mockResults);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { title: { contains: 'EHR', mode: 'insensitive' } },
          { description: { contains: 'EHR', mode: 'insensitive' } },
        ],
      },
      take: 50,
    });
  });

  it('should scope search to entity when entityId provided', async () => {
    mockFindMany.mockResolvedValue([]);

    await textSearch('task', 'test', ['title'], 'entity-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ title: { contains: 'test', mode: 'insensitive' } }],
        entityId: 'entity-1',
      },
      take: 50,
    });
  });

  it('should throw for invalid model name', async () => {
    await expect(textSearch('nonExistentModel', 'query', ['field'])).rejects.toThrow(
      'Model "nonExistentModel" not found on Prisma client'
    );
  });
});
