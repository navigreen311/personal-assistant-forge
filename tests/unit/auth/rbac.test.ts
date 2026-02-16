import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissions,
  ROLE_PERMISSIONS,
} from '@/modules/security/rbac';
import type { Permission } from '@/modules/security/rbac';

describe('hasPermission', () => {
  it('should return true for owner with any permission', () => {
    expect(hasPermission('owner', 'user:manage')).toBe(true);
    expect(hasPermission('owner', 'entity:delete')).toBe(true);
    expect(hasPermission('owner', 'financial:approve')).toBe(true);
  });

  it('should return false for viewer with write permissions', () => {
    expect(hasPermission('viewer', 'entity:create')).toBe(false);
    expect(hasPermission('viewer', 'task:update')).toBe(false);
    expect(hasPermission('viewer', 'message:send')).toBe(false);
    expect(hasPermission('viewer', 'entity:delete')).toBe(false);
  });

  it('should return true for member with own-resource permissions', () => {
    expect(hasPermission('member', 'task:create')).toBe(true);
    expect(hasPermission('member', 'task:read')).toBe(true);
    expect(hasPermission('member', 'contact:create')).toBe(true);
    expect(hasPermission('member', 'message:send')).toBe(true);
  });

  it('should return false for member with user:manage', () => {
    expect(hasPermission('member', 'user:manage')).toBe(false);
  });

  it('should return false for admin with user:manage', () => {
    expect(hasPermission('admin', 'user:manage')).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('should return true if role has at least one permission', () => {
    expect(hasAnyPermission('viewer', ['entity:read', 'entity:create'])).toBe(true);
  });

  it('should return false if role has none of the permissions', () => {
    expect(hasAnyPermission('viewer', ['entity:create', 'entity:delete'])).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('should return true only if role has all permissions', () => {
    expect(hasAllPermissions('owner', ['entity:create', 'entity:read', 'user:manage'])).toBe(true);
  });

  it('should return false if role is missing any permission', () => {
    expect(hasAllPermissions('viewer', ['entity:read', 'entity:create'])).toBe(false);
  });
});

describe('getPermissions', () => {
  it('should return all permissions for owner', () => {
    const ownerPerms = getPermissions('owner');
    expect(ownerPerms).toContain('user:manage');
    expect(ownerPerms).toContain('entity:create');
    expect(ownerPerms).toContain('financial:approve');
    // owner should have every permission defined in ROLE_PERMISSIONS
    expect(ownerPerms.length).toBeGreaterThan(0);
  });

  it('should return limited permissions for viewer', () => {
    const viewerPerms = getPermissions('viewer');
    // Viewer should only have read permissions
    for (const perm of viewerPerms) {
      expect(perm).toMatch(/:read$/);
    }
    expect(viewerPerms.length).toBeLessThan(getPermissions('owner').length);
  });

  it('should return a copy (not a reference)', () => {
    const perms = getPermissions('owner');
    perms.push('entity:create' as Permission);
    expect(getPermissions('owner').length).toBe(ROLE_PERMISSIONS.owner.length);
  });
});
