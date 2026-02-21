import { prisma } from '@/lib/db';
import type { PermissionSet } from './types';

const DEFAULT_INTEGRATIONS: { id: string; name: string }[] = [
  { id: 'email', name: 'Email' },
  { id: 'calendar', name: 'Calendar' },
  { id: 'slack', name: 'Slack' },
  { id: 'drive', name: 'Google Drive' },
  { id: 'crm', name: 'CRM' },
  { id: 'billing', name: 'Billing' },
];

function toPermissionSet(
  grant: { resource: string; actions: unknown },
  integrationName?: string
): PermissionSet {
  const actions = grant.actions as { read: boolean; draft: boolean; execute: boolean };
  const integration = DEFAULT_INTEGRATIONS.find((i) => i.id === grant.resource);
  return {
    integrationId: grant.resource,
    integrationName: integrationName ?? integration?.name ?? grant.resource,
    read: actions.read,
    draft: actions.draft,
    execute: actions.execute,
  };
}

export async function getPermissions(userId: string): Promise<PermissionSet[]> {
  const now = new Date();

  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId,
      revoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  const grantMap = new Map<string, typeof grants[number]>();
  for (const grant of grants) {
    grantMap.set(grant.resource, grant);
  }

  const permissions: PermissionSet[] = [];

  for (const integration of DEFAULT_INTEGRATIONS) {
    const existing = grantMap.get(integration.id);

    if (existing) {
      permissions.push(toPermissionSet(existing, integration.name));
    } else {
      // Default permissions: read=true, draft=true, execute=false
      const defaultActions = { read: true, draft: true, execute: false };

      const grant = await prisma.permissionGrant.upsert({
        where: {
          userId_resource: { userId, resource: integration.id },
        },
        create: {
          userId,
          resource: integration.id,
          actions: defaultActions,
          grantedBy: 'system',
        },
        update: {},
      });

      permissions.push(toPermissionSet(grant, integration.name));
    }
  }

  return permissions;
}

export async function updatePermission(
  userId: string,
  integrationId: string,
  permission: Partial<Pick<PermissionSet, 'read' | 'draft' | 'execute'>>
): Promise<PermissionSet> {
  const integration = DEFAULT_INTEGRATIONS.find((i) => i.id === integrationId);

  const defaultActions = { read: true, draft: true, execute: false };
  const mergedActions = {
    read: permission.read ?? defaultActions.read,
    draft: permission.draft ?? defaultActions.draft,
    execute: permission.execute ?? defaultActions.execute,
  };

  const now = new Date();

  // Try to find the existing non-revoked, non-expired grant
  const existing = await prisma.permissionGrant.findFirst({
    where: {
      userId,
      resource: integrationId,
      revoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  if (existing) {
    const existingActions = existing.actions as { read: boolean; draft: boolean; execute: boolean };
    const updatedActions = {
      read: permission.read !== undefined ? permission.read : existingActions.read,
      draft: permission.draft !== undefined ? permission.draft : existingActions.draft,
      execute: permission.execute !== undefined ? permission.execute : existingActions.execute,
    };

    const grant = await prisma.permissionGrant.upsert({
      where: {
        userId_resource: { userId, resource: integrationId },
      },
      create: {
        userId,
        resource: integrationId,
        actions: updatedActions,
        grantedBy: 'user',
      },
      update: {
        actions: updatedActions,
        grantedBy: 'user',
      },
    });

    return toPermissionSet(grant, integration?.name);
  }

  const grant = await prisma.permissionGrant.upsert({
    where: {
      userId_resource: { userId, resource: integrationId },
    },
    create: {
      userId,
      resource: integrationId,
      actions: mergedActions,
      grantedBy: 'user',
    },
    update: {
      actions: mergedActions,
      grantedBy: 'user',
      revoked: false,
    },
  });

  return toPermissionSet(grant, integration?.name);
}

export async function checkPermission(
  userId: string,
  integrationId: string,
  action: 'read' | 'draft' | 'execute'
): Promise<boolean> {
  const now = new Date();

  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId,
      resource: integrationId,
      revoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  if (!grant) return action !== 'execute'; // Default: read and draft allowed, execute not

  const actions = grant.actions as { read: boolean; draft: boolean; execute: boolean };
  return actions[action];
}
