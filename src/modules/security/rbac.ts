export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | 'entity:create' | 'entity:read' | 'entity:update' | 'entity:delete'
  | 'contact:create' | 'contact:read' | 'contact:update' | 'contact:delete'
  | 'task:create' | 'task:read' | 'task:update' | 'task:delete'
  | 'project:create' | 'project:read' | 'project:update' | 'project:delete'
  | 'message:create' | 'message:read' | 'message:update' | 'message:delete' | 'message:send'
  | 'calendar:create' | 'calendar:read' | 'calendar:update' | 'calendar:delete'
  | 'workflow:create' | 'workflow:read' | 'workflow:update' | 'workflow:delete' | 'workflow:execute'
  | 'financial:create' | 'financial:read' | 'financial:update' | 'financial:approve'
  | 'settings:read' | 'settings:update'
  | 'user:manage';

const ALL_PERMISSIONS: Permission[] = [
  'entity:create', 'entity:read', 'entity:update', 'entity:delete',
  'contact:create', 'contact:read', 'contact:update', 'contact:delete',
  'task:create', 'task:read', 'task:update', 'task:delete',
  'project:create', 'project:read', 'project:update', 'project:delete',
  'message:create', 'message:read', 'message:update', 'message:delete', 'message:send',
  'calendar:create', 'calendar:read', 'calendar:update', 'calendar:delete',
  'workflow:create', 'workflow:read', 'workflow:update', 'workflow:delete', 'workflow:execute',
  'financial:create', 'financial:read', 'financial:update', 'financial:approve',
  'settings:read', 'settings:update',
  'user:manage',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [...ALL_PERMISSIONS],

  admin: ALL_PERMISSIONS.filter((p) => p !== 'user:manage'),

  member: [
    'entity:read',
    'contact:create', 'contact:read', 'contact:update',
    'task:create', 'task:read', 'task:update',
    'project:read',
    'message:create', 'message:read', 'message:update', 'message:send',
    'calendar:create', 'calendar:read', 'calendar:update',
    'workflow:read',
    'financial:read',
    'settings:read',
  ],

  viewer: [
    'entity:read',
    'contact:read',
    'task:read',
    'project:read',
    'message:read',
    'calendar:read',
    'workflow:read',
    'financial:read',
    'settings:read',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  return permissions.some((p) => rolePerms.includes(p));
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  return permissions.every((p) => rolePerms.includes(p));
}

export function getPermissions(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
