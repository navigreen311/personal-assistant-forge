import type { PermissionSet } from '@/engines/trust-ui/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    permissionGrant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { getPermissions, updatePermission, checkPermission } from '@/engines/trust-ui/permissions-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFindMany = mockPrisma.permissionGrant.findMany as jest.Mock;
const mockFindFirst = mockPrisma.permissionGrant.findFirst as jest.Mock;
const mockUpsert = mockPrisma.permissionGrant.upsert as jest.Mock;

describe('getPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return existing grants for all default integrations', async () => {
    const grants = [
      { id: 'g1', userId: 'u1', resource: 'email', actions: { read: true, draft: true, execute: true }, revoked: false, grantedBy: 'user', grantedAt: new Date(), expiresAt: null },
      { id: 'g2', userId: 'u1', resource: 'calendar', actions: { read: true, draft: false, execute: false }, revoked: false, grantedBy: 'user', grantedAt: new Date(), expiresAt: null },
      { id: 'g3', userId: 'u1', resource: 'slack', actions: { read: true, draft: true, execute: false }, revoked: false, grantedBy: 'system', grantedAt: new Date(), expiresAt: null },
      { id: 'g4', userId: 'u1', resource: 'drive', actions: { read: true, draft: true, execute: false }, revoked: false, grantedBy: 'system', grantedAt: new Date(), expiresAt: null },
      { id: 'g5', userId: 'u1', resource: 'crm', actions: { read: true, draft: true, execute: false }, revoked: false, grantedBy: 'system', grantedAt: new Date(), expiresAt: null },
      { id: 'g6', userId: 'u1', resource: 'billing', actions: { read: false, draft: false, execute: false }, revoked: false, grantedBy: 'system', grantedAt: new Date(), expiresAt: null },
    ];

    mockFindMany.mockResolvedValue(grants);

    const result = await getPermissions('u1');

    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      integrationId: 'email',
      integrationName: 'Email',
      read: true,
      draft: true,
      execute: true,
    });
    expect(result[1]).toEqual({
      integrationId: 'calendar',
      integrationName: 'Calendar',
      read: true,
      draft: false,
      execute: false,
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          revoked: false,
        }),
      })
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('should create default grants for missing integrations', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'g1', userId: 'u1', resource: 'email', actions: { read: true, draft: true, execute: false }, revoked: false, grantedBy: 'system', grantedAt: new Date(), expiresAt: null },
    ]);

    mockUpsert.mockImplementation(({ create }) => {
      return Promise.resolve({
        id: 'new-id',
        userId: create.userId,
        resource: create.resource,
        actions: create.actions,
        revoked: false,
        grantedBy: create.grantedBy,
        grantedAt: new Date(),
        expiresAt: null,
      });
    });

    const result = await getPermissions('u1');

    expect(result).toHaveLength(6);
    expect(mockUpsert).toHaveBeenCalledTimes(5);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].read).toBe(true);
      expect(result[i].draft).toBe(true);
      expect(result[i].execute).toBe(false);
    }
  });

  it('should create all defaults when no grants exist', async () => {
    mockFindMany.mockResolvedValue([]);
    mockUpsert.mockImplementation(({ create }) => {
      return Promise.resolve({
        id: 'new-id',
        userId: create.userId,
        resource: create.resource,
        actions: create.actions,
        revoked: false,
        grantedBy: create.grantedBy,
        grantedAt: new Date(),
        expiresAt: null,
      });
    });

    const result = await getPermissions('u1');

    expect(result).toHaveLength(6);
    expect(mockUpsert).toHaveBeenCalledTimes(6);

    const ids = result.map((r: PermissionSet) => r.integrationId);
    expect(ids).toEqual(['email', 'calendar', 'slack', 'drive', 'crm', 'billing']);
  });

  it('should filter out revoked grants via query', async () => {
    mockFindMany.mockResolvedValue([]);
    mockUpsert.mockImplementation(({ create }) => {
      return Promise.resolve({
        id: 'new-id',
        userId: create.userId,
        resource: create.resource,
        actions: create.actions,
        revoked: false,
        grantedBy: create.grantedBy,
        grantedAt: new Date(),
        expiresAt: null,
      });
    });

    await getPermissions('u1');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revoked: false,
        }),
      })
    );
  });

  it('should include expiry filter in query', async () => {
    mockFindMany.mockResolvedValue([]);
    mockUpsert.mockImplementation(({ create }) => {
      return Promise.resolve({
        id: 'new-id',
        userId: create.userId,
        resource: create.resource,
        actions: create.actions,
        revoked: false,
        grantedBy: create.grantedBy,
        grantedAt: new Date(),
        expiresAt: null,
      });
    });

    await getPermissions('u1');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { expiresAt: null },
            expect.objectContaining({ expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }),
          ]),
        }),
      })
    );
  });
});

describe('updatePermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update an existing grant with partial permissions', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'g1',
      userId: 'u1',
      resource: 'email',
      actions: { read: true, draft: true, execute: false },
      revoked: false,
      grantedBy: 'system',
      grantedAt: new Date(),
      expiresAt: null,
    });

    mockUpsert.mockResolvedValue({
      id: 'g1',
      userId: 'u1',
      resource: 'email',
      actions: { read: true, draft: true, execute: true },
      revoked: false,
      grantedBy: 'user',
      grantedAt: new Date(),
      expiresAt: null,
    });

    const result = await updatePermission('u1', 'email', { execute: true });

    expect(result).toEqual({
      integrationId: 'email',
      integrationName: 'Email',
      read: true,
      draft: true,
      execute: true,
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_resource: { userId: 'u1', resource: 'email' } },
        update: expect.objectContaining({
          actions: { read: true, draft: true, execute: true },
        }),
      })
    );
  });

  it('should create a new grant when no existing grant found', async () => {
    mockFindFirst.mockResolvedValue(null);

    mockUpsert.mockResolvedValue({
      id: 'new-id',
      userId: 'u1',
      resource: 'slack',
      actions: { read: true, draft: true, execute: true },
      revoked: false,
      grantedBy: 'user',
      grantedAt: new Date(),
      expiresAt: null,
    });

    const result = await updatePermission('u1', 'slack', { execute: true });

    expect(result).toEqual({
      integrationId: 'slack',
      integrationName: 'Slack',
      read: true,
      draft: true,
      execute: true,
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_resource: { userId: 'u1', resource: 'slack' } },
      })
    );
  });
});

describe('checkPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when action is allowed', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'g1',
      userId: 'u1',
      resource: 'email',
      actions: { read: true, draft: true, execute: true },
      revoked: false,
      grantedBy: 'user',
      grantedAt: new Date(),
      expiresAt: null,
    });

    const result = await checkPermission('u1', 'email', 'execute');
    expect(result).toBe(true);
  });

  it('should return false when action is denied', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'g1',
      userId: 'u1',
      resource: 'email',
      actions: { read: true, draft: true, execute: false },
      revoked: false,
      grantedBy: 'user',
      grantedAt: new Date(),
      expiresAt: null,
    });

    const result = await checkPermission('u1', 'email', 'execute');
    expect(result).toBe(false);
  });

  it('should default to allowing read when no grant exists', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await checkPermission('u1', 'email', 'read');
    expect(result).toBe(true);
  });

  it('should default to denying execute when no grant exists', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await checkPermission('u1', 'email', 'execute');
    expect(result).toBe(false);
  });
});
