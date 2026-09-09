// ============================================================================
// Role service — P-10 / T-007
//
// WAS: `roleStore = new Map<string, RolePermission>()` and
//      `userRoleMap = new Map<string, string[]>()`, with custom roles smuggled
//      into the `Document` table as rows of `type: 'ROLE_DEFINITION'` whose
//      `content` was a JSON blob.
//
// THE DEFECT THE GREEN TESTS DID NOT SHOW
//
// `assignRole()` wrote the assignment to TWO places: the in-memory
// `userRoleMap`, and `User.preferences.assignedRoles` on a best-effort basis.
// `checkPermission()` read ONLY the in-memory map. So a role granted before a
// restart was durably recorded in the database and then completely ignored: the
// user's permissions silently reverted, and the evidence that they had been
// granted was still sitting there in `preferences`. Every unit test passed
// because a single process never restarts mid-suite.
//
// NOW: `Role` and `UserRoleAssignment` (both landed by P-00) are the store, and
// `checkPermission` reads back from the same place `assignRole` wrote to. The
// `Document`-as-role-table shim is gone.
//
// WHY ROLE NAMES ARE STORED SCOPED
//
// `Role.roleName` is `@unique` GLOBALLY in the frozen schema. Storing a custom
// role's bare name would mean entity A creating "Ops" prevents entity B from
// ever creating "Ops" — one tenant denying another a name, and learning from
// the failure that the other tenant has that role. That is cross-tenant
// interference through a uniqueness constraint, which is the exact class of bug
// this build exists to close, so it is not acceptable as a "known limitation".
//
// Custom roles are therefore stored under `<entityId>::<name>` and the bare name
// is what the API returns. The composite satisfies the global constraint while
// keeping the namespace per-entity, and it needs no migration. Flagged to the
// coordinator: if a later wave can amend the schema, `@@unique([entityId, roleName])`
// with a real `entityId` column is the shape this wants.
//
// The four DEFAULT roles are code constants, not rows — unchanged from before.
// ============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { RolePermission } from '../types';

/** Separator for the scoped `Role.roleName`. See the header note. */
const SCOPE_SEPARATOR = '::';

function scopedRoleName(entityId: string, name: string): string {
  return `${entityId}${SCOPE_SEPARATOR}${name}`;
}

function bareRoleName(stored: string): string {
  const at = stored.indexOf(SCOPE_SEPARATOR);
  return at === -1 ? stored : stored.slice(at + SCOPE_SEPARATOR.length);
}

type RoleRow = {
  id: string;
  roleName: string;
  permissions: Prisma.JsonValue;
  entityScope: Prisma.JsonValue;
  isDefault: boolean;
};

function toStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toRolePermission(row: RoleRow): RolePermission {
  return {
    roleId: row.id,
    roleName: bareRoleName(row.roleName),
    permissions: toStringArray(row.permissions),
    entityScope: toStringArray(row.entityScope),
    isDefault: row.isDefault,
  };
}

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

/** A default role by id, or undefined. Defaults never hit the database. */
function defaultRoleById(roleId: string): RolePermission | undefined {
  return getDefaultRoles().find((r) => r.roleId === roleId);
}

export async function createRole(
  entityId: string,
  name: string,
  permissions: string[],
): Promise<RolePermission> {
  const stored = scopedRoleName(entityId, name);

  const existing = await prisma.role.findUnique({ where: { roleName: stored } });
  if (existing) {
    throw new Error(`Role "${name}" already exists for entity ${entityId}`);
  }

  const row = await prisma.role.create({
    data: {
      roleName: stored,
      permissions: permissions as unknown as Prisma.InputJsonValue,
      entityScope: [entityId] as unknown as Prisma.InputJsonValue,
      isDefault: false,
    },
  });

  return toRolePermission(row as RoleRow);
}

/**
 * The default roles plus every custom role scoped to this entity.
 *
 * The scope filter is applied in the WHERE clause, not after the fetch: a role
 * belonging to another entity is simply not returned, so there is no
 * check-then-act step for a later edit to drop.
 */
export async function getRoles(entityId: string): Promise<RolePermission[]> {
  const defaults = getDefaultRoles();

  const rows = (await prisma.role.findMany({
    where: { roleName: { startsWith: scopedRoleName(entityId, '') } },
    orderBy: { createdAt: 'asc' },
  })) as RoleRow[];

  return [...defaults, ...rows.map(toRolePermission)];
}

/**
 * Grant a role to a user.
 *
 * `assignedBy` names the granting actor. It was not recorded at all before, so
 * "who gave this person write access" had no answer anywhere in the system.
 */
export async function assignRole(
  userId: string,
  roleId: string,
  _entityId?: string,
  assignedBy?: string,
): Promise<void> {
  const isDefault = defaultRoleById(roleId) !== undefined;
  if (!isDefault) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new Error(`Role ${roleId} not found`);
  }

  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId, assignedBy: assignedBy ?? null },
    update: { assignedBy: assignedBy ?? null },
  });
}

/**
 * Does this user hold `permission` for this entity?
 *
 * Reads the assignments back out of the same table `assignRole` writes to. That
 * sentence is the entire fix: previously it read a process Map that no longer
 * contained anything a moment after deploy, so permissions granted yesterday
 * evaluated to `false` today with no error and no log line.
 */
export async function checkPermission(
  userId: string,
  permission: string,
  entityId: string,
): Promise<boolean> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId },
    select: { roleId: true },
  });
  if (assignments.length === 0) return false;

  const roleIds = assignments.map((a: { roleId: string }) => a.roleId);

  const roles: RolePermission[] = [];
  for (const roleId of roleIds) {
    const fromDefaults = defaultRoleById(roleId);
    if (fromDefaults) roles.push(fromDefaults);
  }

  const customIds = roleIds.filter((id: string) => defaultRoleById(id) === undefined);
  if (customIds.length > 0) {
    const rows = (await prisma.role.findMany({ where: { id: { in: customIds } } })) as RoleRow[];
    roles.push(...rows.map(toRolePermission));
  }

  return roles.some(
    (role) =>
      (role.entityScope.includes('*') || role.entityScope.includes(entityId)) &&
      role.permissions.includes(permission),
  );
}

export async function removeRole(
  userId: string,
  roleId: string,
  _entityId?: string,
): Promise<void> {
  // deleteMany, not delete: a revocation that throws because the grant was
  // already gone is not a failure, and `delete` on a missing row throws.
  await prisma.userRoleAssignment.deleteMany({ where: { userId, roleId } });
}
