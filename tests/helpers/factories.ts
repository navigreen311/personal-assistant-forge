/**
 * P-01 — Real-database test harness: fixture factories.
 *
 * Every factory writes a real row to a real Postgres and returns the real
 * Prisma model. Nothing here is a stub. If a column moved, a factory breaks --
 * which is the point: that is the failure a mocked client cannot produce.
 *
 * ============================================================================
 * THE CENTRAL FIXTURE
 * ============================================================================
 *
 * The audit's core bug is that user A can read and write user B's entity by
 * passing B's id. Proving that is closed needs exactly one shape: two users,
 * each owning their own entity, each holding a valid session. That is
 * `createTwoTenants()`, and it is one call:
 *
 *   const { tenantA, tenantB } = await createTwoTenants();
 *
 * Each tenant carries `{ user, entity, token }`; the token is a real, encrypted
 * NextAuth JWT (see `session.ts`), so `requestAs(tenantA, ...)` presents a
 * session the production middleware verifies rather than trusts.
 *
 * ============================================================================
 * CONVENTIONS
 * ============================================================================
 *
 * - Ids are left to Prisma (`cuid()`); tests should read them off the returned
 *   row rather than assume a value.
 * - Anything that must be unique (a User's email) gets a per-process counter
 *   suffix, so a test that creates ten users does not collide.
 * - Every factory takes an `overrides` object merged last, so a test that cares
 *   about one field states only that field.
 * - Ownership is always explicit: `createEntity` requires a userId,
 *   `createTask` requires an entityId. There are no ambient defaults, because
 *   an ambient default is how a tenancy test accidentally proves nothing.
 */

import type { Contact, Entity, Prisma, Project, Task, User } from '@prisma/client';
import { db } from './db';

let seq = 0;
/** Monotonic per-process suffix for unique columns. */
function nextSeq(): number {
  seq += 1;
  return seq;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserOverrides = Partial<{
  name: string;
  email: string;
  hashedPassword: string | null;
  preferences: Prisma.InputJsonValue;
  timezone: string;
  chronotype: string | null;
}>;

/**
 * A user with a unique email.
 *
 * `hashedPassword` is left null by default. Credentials sign-in is not what
 * `tests/db/` exercises -- `session.ts` mints the JWT directly, the same way
 * NextAuth would after a successful sign-in. A package testing the credentials
 * provider itself should pass a real bcrypt hash here.
 */
export async function createUser(overrides: UserOverrides = {}): Promise<User> {
  const n = nextSeq();
  return db.user.create({
    data: {
      name: `Test User ${n}`,
      email: `test-user-${n}-${Date.now()}@example.test`,
      timezone: 'America/Chicago',
      preferences: {},
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export type EntityOverrides = Partial<{
  name: string;
  type: string;
  complianceProfile: string[];
  phoneNumbers: string[];
}>;

/**
 * An entity owned by `userId`.
 *
 * The owning user is a required positional argument, not an override, because
 * `Entity.userId` is the single field the entire tenancy model turns on.
 */
export async function createEntity(
  userId: string,
  overrides: EntityOverrides = {}
): Promise<Entity> {
  const n = nextSeq();
  return db.entity.create({
    data: {
      userId,
      name: `Test Entity ${n}`,
      type: 'Personal',
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type ProjectOverrides = Partial<{
  name: string;
  description: string | null;
  status: string;
  health: string;
}>;

export async function createProject(
  entityId: string,
  overrides: ProjectOverrides = {}
): Promise<Project> {
  const n = nextSeq();
  return db.project.create({
    data: {
      entityId,
      name: `Test Project ${n}`,
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export type TaskOverrides = Partial<{
  title: string;
  description: string | null;
  projectId: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  assigneeId: string | null;
  tags: string[];
}>;

export async function createTask(
  entityId: string,
  overrides: TaskOverrides = {}
): Promise<Task> {
  const n = nextSeq();
  return db.task.create({
    data: {
      entityId,
      title: `Test Task ${n}`,
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export type ContactOverrides = Partial<{
  name: string;
  email: string | null;
  phone: string | null;
  relationshipScore: number;
  tags: string[];
}>;

export async function createContact(
  entityId: string,
  overrides: ContactOverrides = {}
): Promise<Contact> {
  const n = nextSeq();
  return db.contact.create({
    data: {
      entityId,
      name: `Test Contact ${n}`,
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// Tenants -- the fixture the tenancy tests actually want
// ---------------------------------------------------------------------------

/**
 * A user, an entity they own, and a session token that proves it.
 *
 * `token` is a real encrypted NextAuth JWT with `activeEntityId` set to
 * `entity.id`, so a request that names no entity at all still resolves to this
 * tenant's own entity -- matching how `withEntityScope` behaves in production.
 */
export interface Tenant {
  user: User;
  entity: Entity;
  /** Encrypted NextAuth session JWT. Consumed by `requestAs` in `session.ts`. */
  token: string;
}

export interface TenantOptions {
  user?: UserOverrides;
  entity?: EntityOverrides;
  /** Role carried in the session JWT. Defaults to 'owner'. */
  role?: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * One user, one entity they own, one valid session. The unit of tenancy.
 *
 * Imported lazily to keep `factories.ts` usable in a test that only needs rows
 * and never builds a request.
 */
export async function createTenant(options: TenantOptions = {}): Promise<Tenant> {
  const user = await createUser(options.user);
  const entity = await createEntity(user.id, options.entity);

  const { sessionTokenFor } = await import('./session');
  const token = await sessionTokenFor({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: options.role ?? 'owner',
    activeEntityId: entity.id,
  });

  return { user, entity, token };
}

/**
 * Two separate tenants. The central cross-tenant fixture, in one call.
 *
 *   const { tenantA, tenantB } = await createTwoTenants();
 *   const res = await GET(requestAs(tenantA, `/api/tasks?entityId=${tenantB.entity.id}`));
 *   expect(res.status).toBe(403);
 */
export async function createTwoTenants(): Promise<{ tenantA: Tenant; tenantB: Tenant }> {
  const tenantA = await createTenant();
  const tenantB = await createTenant();
  return { tenantA, tenantB };
}
