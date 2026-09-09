// ============================================================================
// Role service — unit tests.
//
// P-10/T-007 REWRITE, and worth reading before assuming the old file was fine.
//
// The previous version imported `roleStore` and `userRoleMap` — the service's
// two module-level Maps — and asserted directly against them:
//
//     await assignRole('user-1', 'role-admin');
//     expect(userRoleMap.get('user-1')).toContain('role-admin');
//
// That is an assertion about a variable, not about the system. It passed
// whether or not the grant was ever persisted, and it kept passing while
// `assignRole` wrote to `User.preferences` and `checkPermission` read from the
// Map, so a role granted before a restart evaluated to `false` afterwards with
// no error anywhere. The suite was green the whole time.
//
// This version stands a tiny in-memory FAKE behind the two Prisma delegates the
// service actually uses, and asserts round trips: what `assignRole` wrote is
// what `checkPermission` reads. Against the old implementation the round-trip
// tests fail, because the old implementation never read back what it wrote.
// ============================================================================

interface RoleRow {
  id: string;
  roleName: string;
  permissions: string[];
  entityScope: string[];
  isDefault: boolean;
  createdAt: Date;
}

interface AssignmentRow {
  userId: string;
  roleId: string;
  assignedBy: string | null;
}

const roleRows: RoleRow[] = [];
const assignmentRows: AssignmentRow[] = [];
let roleSeq = 0;

function matchesRoleWhere(row: RoleRow, where: Record<string, unknown> = {}): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  const idIn = (where.id as { in?: string[] } | undefined)?.in;
  if (Array.isArray(idIn) && !idIn.includes(row.id)) return false;
  if (typeof where.roleName === 'string' && row.roleName !== where.roleName) return false;
  const startsWith = (where.roleName as { startsWith?: string } | undefined)?.startsWith;
  if (typeof startsWith === 'string' && !row.roleName.startsWith(startsWith)) return false;
  return true;
}

jest.mock('@/lib/db', () => ({
  prisma: {
    role: {
      create: jest.fn(async ({ data }: { data: Omit<RoleRow, 'id' | 'createdAt'> }) => {
        roleSeq += 1;
        const row: RoleRow = { ...data, id: `role-row-${roleSeq}`, createdAt: new Date() };
        roleRows.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        roleRows.find((r) => matchesRoleWhere(r, where)) ?? null),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
        roleRows.filter((r) => matchesRoleWhere(r, where))),
    },
    userRoleAssignment: {
      upsert: jest.fn(async ({
        where,
        create,
      }: {
        where: { userId_roleId: { userId: string; roleId: string } };
        create: AssignmentRow;
      }) => {
        const { userId, roleId } = where.userId_roleId;
        const existing = assignmentRows.find((a) => a.userId === userId && a.roleId === roleId);
        if (existing) return existing;
        assignmentRows.push(create);
        return create;
      }),
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        assignmentRows.filter((a) => a.userId === where.userId)),
      deleteMany: jest.fn(async ({ where }: { where: { userId: string; roleId: string } }) => {
        const before = assignmentRows.length;
        for (let i = assignmentRows.length - 1; i >= 0; i--) {
          if (assignmentRows[i].userId === where.userId && assignmentRows[i].roleId === where.roleId) {
            assignmentRows.splice(i, 1);
          }
        }
        return { count: before - assignmentRows.length };
      }),
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
} from '@/modules/delegation/services/role-service';

const { prisma } = jest.requireMock('@/lib/db');

beforeEach(() => {
  roleRows.length = 0;
  assignmentRows.length = 0;
  roleSeq = 0;
  jest.clearAllMocks();
});

describe('createRole', () => {
  it('should create a Role row, not a Document', async () => {
    const role = await createRole('entity-1', 'CustomRole', ['tasks.read', 'tasks.write']);

    expect(prisma.role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDefault: false }),
      })
    );
    expect(role.roleName).toBe('CustomRole');
    expect(role.permissions).toEqual(['tasks.read', 'tasks.write']);
    expect(role.entityScope).toEqual(['entity-1']);
  });

  it('should reject a duplicate role name within the same entity', async () => {
    await createRole('entity-1', 'ExistingRole', ['tasks.read']);

    await expect(
      createRole('entity-1', 'ExistingRole', ['tasks.read'])
    ).rejects.toThrow(/already exists/);
  });

  it('should NOT let one entity block a name for another entity', async () => {
    // `Role.roleName` is globally @unique in the frozen schema. Storing the bare
    // name would make this throw -- one tenant denying another a role name, and
    // learning from the failure that the other tenant has it. See the header of
    // role-service.ts for why names are stored scoped.
    await createRole('entity-1', 'Ops', ['tasks.read']);

    const other = await createRole('entity-2', 'Ops', ['tasks.write']);
    expect(other.roleName).toBe('Ops');
    expect(other.entityScope).toEqual(['entity-2']);
  });
});

describe('getRoles', () => {
  it('should always include default roles', async () => {
    const roles = await getRoles('entity-1');

    const defaultNames = getDefaultRoles().map((r) => r.roleName);
    const returnedNames = roles.map((r) => r.roleName);
    for (const name of defaultNames) {
      expect(returnedNames).toContain(name);
    }
  });

  it('should include custom roles for this entity', async () => {
    const created = await createRole('entity-1', 'Manager', ['tasks.read', 'tasks.delete']);

    const roles = await getRoles('entity-1');
    const managerRole = roles.find((r) => r.roleName === 'Manager');
    expect(managerRole).toBeDefined();
    expect(managerRole!.roleId).toBe(created.roleId);
  });

  it("should not return another entity's custom roles", async () => {
    await createRole('entity-2', 'TheirRole', ['tasks.read']);

    const roles = await getRoles('entity-1');
    expect(roles.map((r) => r.roleName)).not.toContain('TheirRole');
  });
});

describe('assignRole', () => {
  it('should persist the assignment through the UserRoleAssignment table', async () => {
    await assignRole('user-1', 'role-admin');

    expect(prisma.userRoleAssignment.upsert).toHaveBeenCalledTimes(1);
    expect(assignmentRows).toEqual([
      expect.objectContaining({ userId: 'user-1', roleId: 'role-admin' }),
    ]);
  });

  it('should record who granted the role', async () => {
    // Nothing recorded this before, so "who gave this person write access" had
    // no answer anywhere in the system.
    await assignRole('user-1', 'role-admin', undefined, 'admin-9');

    expect(assignmentRows[0].assignedBy).toBe('admin-9');
  });

  it('should not duplicate role assignments', async () => {
    await assignRole('user-1', 'role-admin');
    await assignRole('user-1', 'role-admin');

    expect(assignmentRows.filter((a) => a.roleId === 'role-admin')).toHaveLength(1);
  });

  it('should throw for a non-existent role', async () => {
    await expect(assignRole('user-1', 'nonexistent-role')).rejects.toThrow(/not found/);
  });

  it('should accept a custom role that exists', async () => {
    const custom = await createRole('entity-1', 'Manager', ['tasks.read']);

    await expect(assignRole('user-1', custom.roleId)).resolves.toBeUndefined();
  });
});

describe('checkPermission', () => {
  it('should read back a grant that assignRole wrote', async () => {
    // THE round trip. The previous implementation wrote to User.preferences and
    // read from an in-memory Map, so this is the assertion it could not pass
    // once the process restarted -- and no test made it restart.
    await assignRole('user-1', 'role-admin');

    expect(await checkPermission('user-1', 'tasks.read', 'entity-1')).toBe(true);
  });

  it('should return false when the user lacks the permission', async () => {
    await assignRole('user-1', 'role-viewer');

    expect(await checkPermission('user-1', 'tasks.delete', 'entity-1')).toBe(false);
  });

  it('should check all assigned roles for the permission', async () => {
    await assignRole('user-1', 'role-viewer');
    expect(await checkPermission('user-1', 'tasks.write', 'entity-1')).toBe(false);

    await assignRole('user-1', 'role-editor');
    expect(await checkPermission('user-1', 'tasks.write', 'entity-1')).toBe(true);
  });

  it('should return false for a user with no roles', async () => {
    expect(await checkPermission('no-roles-user', 'tasks.read', 'entity-1')).toBe(false);
  });

  it('should respect entity scope', async () => {
    // role-delegate has an empty entityScope: it grants nothing anywhere.
    await assignRole('user-1', 'role-delegate');

    expect(await checkPermission('user-1', 'tasks.read', 'entity-1')).toBe(false);
  });

  it('should honour a custom role scoped to one entity only', async () => {
    const custom = await createRole('entity-1', 'Manager', ['tasks.delete']);
    await assignRole('user-1', custom.roleId);

    expect(await checkPermission('user-1', 'tasks.delete', 'entity-1')).toBe(true);
    expect(await checkPermission('user-1', 'tasks.delete', 'entity-2')).toBe(false);
  });
});

describe('removeRole', () => {
  it('should revoke a grant so checkPermission stops returning true', async () => {
    await assignRole('user-1', 'role-admin');
    expect(await checkPermission('user-1', 'tasks.read', 'entity-1')).toBe(true);

    await removeRole('user-1', 'role-admin');
    expect(await checkPermission('user-1', 'tasks.read', 'entity-1')).toBe(false);
  });

  it('should not throw when removing a role the user does not have', async () => {
    await expect(removeRole('user-1', 'role-admin')).resolves.toBeUndefined();
  });
});
