import type { PermissionSet } from './types';

// In-memory permission store. In production, this would be backed by a database table.
// Using a Map keyed by `${userId}:${integrationId}`.
const permissionStore = new Map<string, PermissionSet>();

function getKey(userId: string, integrationId: string): string {
  return `${userId}:${integrationId}`;
}

const DEFAULT_INTEGRATIONS: { id: string; name: string }[] = [
  { id: 'email', name: 'Email' },
  { id: 'calendar', name: 'Calendar' },
  { id: 'slack', name: 'Slack' },
  { id: 'drive', name: 'Google Drive' },
  { id: 'crm', name: 'CRM' },
  { id: 'billing', name: 'Billing' },
];

export async function getPermissions(userId: string): Promise<PermissionSet[]> {
  const permissions: PermissionSet[] = [];

  for (const integration of DEFAULT_INTEGRATIONS) {
    const key = getKey(userId, integration.id);
    const existing = permissionStore.get(key);

    if (existing) {
      permissions.push(existing);
    } else {
      // Default permissions: read=true, draft=true, execute=false
      const defaultPerm: PermissionSet = {
        integrationId: integration.id,
        integrationName: integration.name,
        read: true,
        draft: true,
        execute: false,
      };
      permissionStore.set(key, defaultPerm);
      permissions.push(defaultPerm);
    }
  }

  return permissions;
}

export async function updatePermission(
  userId: string,
  integrationId: string,
  permission: Partial<Pick<PermissionSet, 'read' | 'draft' | 'execute'>>
): Promise<PermissionSet> {
  const key = getKey(userId, integrationId);
  const existing = permissionStore.get(key);

  if (!existing) {
    const integration = DEFAULT_INTEGRATIONS.find((i) => i.id === integrationId);
    const newPerm: PermissionSet = {
      integrationId,
      integrationName: integration?.name ?? integrationId,
      read: permission.read ?? true,
      draft: permission.draft ?? true,
      execute: permission.execute ?? false,
    };
    permissionStore.set(key, newPerm);
    return newPerm;
  }

  const updated: PermissionSet = {
    ...existing,
    ...(permission.read !== undefined && { read: permission.read }),
    ...(permission.draft !== undefined && { draft: permission.draft }),
    ...(permission.execute !== undefined && { execute: permission.execute }),
  };

  permissionStore.set(key, updated);
  return updated;
}

export async function checkPermission(
  userId: string,
  integrationId: string,
  action: 'read' | 'draft' | 'execute'
): Promise<boolean> {
  const key = getKey(userId, integrationId);
  const perm = permissionStore.get(key);

  if (!perm) return action !== 'execute'; // Default: read and draft allowed, execute not
  return perm[action];
}
