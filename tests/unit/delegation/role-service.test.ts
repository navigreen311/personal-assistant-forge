jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    },
    user: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', preferences: {} }),
    },
  },
}));

import {
  createRole,
  getRoles,
  assignRole,
  checkPermission,
  removeRole,
  getDefaultRoles,
  roleStore,
  userRoleMap,
} from '@/modules/delegation/services/role-service';

const { prisma } = jest.requireMock('@/lib/db');

beforeEach(() => {
  // Reset stores but re-seed defaults
  roleStore.clear();
  userRoleMap.clear();
  for (const role of getDefaultRoles()) {
    roleStore.set(role.roleId, role);
  }
  jest.clearAllMocks();
});

describe('createRole', () => {
  it('should create a role definition document', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.document.create as jest.Mock).mockResolvedValue({ id: 'doc-new-role' });

    const role = await createRole('entity-1', 'CustomRole', ['tasks.read', 'tasks.write']);

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 'entity-1',
          type: 'ROLE_DEFINITION',
          title: 'CustomRole',
        }),
      })
    );
    expect(role.roleId).toBe('doc-new-role');
    expect(role.roleName).toBe('CustomRole');
    expect(role.permissions).toEqual(['tasks.read', 'tasks.write']);
  });

  it('should reject duplicate role names for same entity', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue({
      id: 'existing-role',
      title: 'ExistingRole',
    });

    await expect(
      createRole('entity-1', 'ExistingRole', ['tasks.read'])
    ).rejects.toThrow(/already exists/);
  });

  it('should store created role in cache', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.document.create as jest.Mock).mockResolvedValue({ id: 'doc-cached' });

    await createRole('entity-1', 'CachedRole', ['tasks.read']);

    expect(roleStore.has('doc-cached')).toBe(true);
  });
});

describe('getRoles', () => {
  it('should always include default roles', async () => {
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);

    const roles = await getRoles('entity-1');

    const defaultNames = getDefaultRoles().map((r) => r.roleName);
    const returnedNames = roles.map((r) => r.roleName);
    for (const name of defaultNames) {
      expect(returnedNames).toContain(name);
    }
  });

  it('should include custom roles from DB', async () => {
    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'custom-role-1',
        content: JSON.stringify({
          roleName: 'Manager',
          permissions: ['tasks.read', 'tasks.write', 'tasks.delete'],
          entityScope: ['entity-1'],
          isDefault: false,
        }),
      },
    ]);

    const roles = await getRoles('entity-1');
    const managerRole = roles.find((r) => r.roleName === 'Manager');
    expect(managerRole).toBeDefined();
    expect(managerRole!.roleId).toBe('custom-role-1');
  });
});

describe('assignRole', () => {
  it('should assign a role to a user', async () => {
    await assignRole('user-1', 'role-admin');

    const roles = userRoleMap.get('user-1');
    expect(roles).toContain('role-admin');
  });

  it('should not duplicate role assignments', async () => {
    await assignRole('user-1', 'role-admin');
    await assignRole('user-1', 'role-admin');

    const roles = userRoleMap.get('user-1')!;
    expect(roles.filter((r) => r === 'role-admin').length).toBe(1);
  });

  it('should throw for non-existent role', async () => {
    await expect(assignRole('user-1', 'nonexistent-role')).rejects.toThrow(/not found/);
  });
});

describe('checkPermission', () => {
  it('should return true when user has the permission', async () => {
    await assignRole('user-1', 'role-admin');

    const hasPermission = await checkPermission('user-1', 'tasks.read', 'entity-1');
    expect(hasPermission).toBe(true);
  });

  it('should return false when user lacks the permission', async () => {
    await assignRole('user-1', 'role-viewer');

    const hasPermission = await checkPermission('user-1', 'tasks.delete', 'entity-1');
    expect(hasPermission).toBe(false);
  });

  it('should check all assigned roles for the permission', async () => {
    await assignRole('user-1', 'role-viewer');
    // Viewer doesn't have tasks.write
    expect(await checkPermission('user-1', 'tasks.write', 'entity-1')).toBe(false);

    await assignRole('user-1', 'role-editor');
    // Editor has tasks.write
    expect(await checkPermission('user-1', 'tasks.write', 'entity-1')).toBe(true);
  });

  it('should return false for user with no roles', async () => {
    const hasPermission = await checkPermission('no-roles-user', 'tasks.read', 'entity-1');
    expect(hasPermission).toBe(false);
  });

  it('should respect entity scope', async () => {
    // role-delegate has empty entityScope
    await assignRole('user-1', 'role-delegate');
    const hasPermission = await checkPermission('user-1', 'tasks.read', 'entity-1');
    // Empty scope means no access
    expect(hasPermission).toBe(false);
  });
});

describe('removeRole', () => {
  it('should remove a role assignment from a user', async () => {
    await assignRole('user-1', 'role-admin');
    expect(userRoleMap.get('user-1')).toContain('role-admin');

    await removeRole('user-1', 'role-admin');
    expect(userRoleMap.get('user-1')).not.toContain('role-admin');
  });

  it('should handle removing a role the user does not have', async () => {
    await removeRole('user-1', 'role-admin');
    // Should not throw
    expect(userRoleMap.get('user-1') || []).not.toContain('role-admin');
  });
});
