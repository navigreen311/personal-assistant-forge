import { v4 as uuidv4 } from 'uuid';
import type { RolePermission } from '../types';

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

export async function createRole(role: Omit<RolePermission, 'roleId'>): Promise<RolePermission> {
  const newRole: RolePermission = { ...role, roleId: uuidv4() };
  roleStore.set(newRole.roleId, newRole);
  return newRole;
}

export async function getRoles(entityId: string): Promise<RolePermission[]> {
  const roles: RolePermission[] = [];
  for (const role of roleStore.values()) {
    if (role.isDefault || role.entityScope.includes('*') || role.entityScope.includes(entityId)) {
      roles.push(role);
    }
  }
  return roles;
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  const role = roleStore.get(roleId);
  if (!role) throw new Error(`Role ${roleId} not found`);
  const existing = userRoleMap.get(userId) || [];
  if (!existing.includes(roleId)) {
    existing.push(roleId);
  }
  userRoleMap.set(userId, existing);
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

// Export for testing
export { roleStore, userRoleMap };
