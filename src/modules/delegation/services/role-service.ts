import { prisma } from '@/lib/db';
import type { RolePermission } from '../types';

// In-memory cache for roles (backed by Prisma Document model)
const roleStore = new Map<string, RolePermission>();
const userRoleMap = new Map<string, string[]>();

export function getDefaultRoles(): RolePermission[] {
  return [
    {
      roleId: 'role-admin',
      roleName: 'Admin',
      permissions: ['tasks.read', 'tasks.write', 'tasks.delete', 'documents.read', 'documents.write', 'documents.delete', 'contacts.read', 'contacts.write', 'settings.manage'],
      entityScope: ['*'],
      isDefault: true,
    },
    {
      roleId: 'role-editor',
      roleName: 'Editor',
      permissions: ['tasks.read', 'tasks.write', 'documents.read', 'documents.write', 'contacts.read'],
      entityScope: ['*'],
      isDefault: true,
    },
    {
      roleId: 'role-viewer',
      roleName: 'Viewer',
      permissions: ['tasks.read', 'documents.read', 'contacts.read'],
      entityScope: ['*'],
      isDefault: true,
    },
    {
      roleId: 'role-delegate',
      roleName: 'Delegate',
      permissions: ['tasks.read', 'tasks.write', 'documents.read'],
      entityScope: [],
      isDefault: true,
    },
  ];
}

// Seed defaults on load
for (const role of getDefaultRoles()) {
  roleStore.set(role.roleId, role);
}

export async function createRole(
  entityId: string,
  name: string,
  permissions: string[]
): Promise<RolePermission> {
  // Check for duplicate role name within entity
  const existing = await prisma.document.findFirst({
    where: {
      entityId,
      type: 'ROLE_DEFINITION',
      title: name,
    },
  });

  if (existing) {
    throw new Error(`Role "${name}" already exists for entity ${entityId}`);
  }

  const roleData: Omit<RolePermission, 'roleId'> = {
    roleName: name,
    permissions,
    entityScope: [entityId],
    isDefault: false,
  };

  const doc = await prisma.document.create({
    data: {
      entityId,
      type: 'ROLE_DEFINITION',
      title: name,
      content: JSON.stringify(roleData),
      status: 'ACTIVE',
    },
  });

  const newRole: RolePermission = { ...roleData, roleId: doc.id };
  roleStore.set(doc.id, newRole);
  return newRole;
}

export async function getRoles(entityId: string): Promise<RolePermission[]> {
  // Always include default roles
  const defaults = getDefaultRoles();

  // Fetch custom roles from DB
  try {
    const docs = await prisma.document.findMany({
      where: {
        entityId,
        type: 'ROLE_DEFINITION',
      },
    });

    const customRoles: RolePermission[] = docs.map((doc: { id: string; content: string | null }) => {
      const data = JSON.parse(doc.content || '{}') as RolePermission;
      data.roleId = doc.id;
      roleStore.set(doc.id, data);
      return data;
    });

    return [...defaults, ...customRoles];
  } catch {
    // Fall back to cache-only
    const roles: RolePermission[] = [...defaults];
    for (const role of roleStore.values()) {
      if (!role.isDefault && (role.entityScope.includes('*') || role.entityScope.includes(entityId))) {
        roles.push(role);
      }
    }
    return roles;
  }
}

export async function assignRole(userId: string, roleId: string, _entityId?: string): Promise<void> {
  const role = roleStore.get(roleId);
  if (!role) throw new Error(`Role ${roleId} not found`);
  const existing = userRoleMap.get(userId) || [];
  if (!existing.includes(roleId)) {
    existing.push(roleId);
  }
  userRoleMap.set(userId, existing);

  // Persist role assignment in user preferences
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const assignedRoles = (prefs.assignedRoles as string[]) || [];
      if (!assignedRoles.includes(roleId)) {
        assignedRoles.push(roleId);
      }
      await prisma.user.update({
        where: { id: userId },
        data: { preferences: { ...prefs, assignedRoles } },
      });
    }
  } catch {
    // DB persistence is best-effort; in-memory map is primary
  }
}

export async function checkPermission(
  userId: string,
  permission: string,
  entityId: string
): Promise<boolean> {
  const roleIds = userRoleMap.get(userId) || [];
  for (const roleId of roleIds) {
    const role = roleStore.get(roleId);
    if (!role) continue;
    const scopeMatch = role.entityScope.includes('*') || role.entityScope.includes(entityId);
    const permMatch = role.permissions.includes(permission);
    if (scopeMatch && permMatch) return true;
  }
  return false;
}

export async function removeRole(userId: string, roleId: string, _entityId?: string): Promise<void> {
  const existing = userRoleMap.get(userId) || [];
  const filtered = existing.filter((id) => id !== roleId);
  userRoleMap.set(userId, filtered);

  // Update user preferences
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const assignedRoles = ((prefs.assignedRoles as string[]) || []).filter((id: string) => id !== roleId);
      await prisma.user.update({
        where: { id: userId },
        data: { preferences: { ...prefs, assignedRoles } },
      });
    }
  } catch {
    // Best-effort DB update
  }
}

// Export for testing
export { roleStore, userRoleMap };
