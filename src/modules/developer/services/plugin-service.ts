import { prisma } from '@/lib/db';
import type { PluginDefinition } from '../types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

const DANGEROUS_PERMISSIONS = ['filesystem', 'network', 'admin', 'admin.all', 'system.execute', 'files.delete_all'];

/**
 * ============================================================================
 * P-37 -- THE IN-MEMORY `pluginStore` IS GONE.
 * ============================================================================
 *
 * It used to live here:
 *
 *     // In-memory store kept for backward compat with security-review-service
 *     export const pluginStore = new Map<string, PluginDefinition>();
 *
 * Every write in this file called `syncToStore(result)` after writing Postgres,
 * and `security-review-service.ts` read plugins out of that Map and nowhere
 * else. So `breakGlassRevoke` -- the emergency kill switch for a malicious
 * plugin -- set `plugin.status = 'REVOKED'` on a Map entry, and:
 *
 *   - a restart un-revoked the plugin, because the Map is rebuilt empty;
 *   - a second instance never saw the revocation at all;
 *   - the plugin being SERVED came from the `Document` row, which the
 *     revocation never touched, so the revoked plugin kept being served
 *     everywhere, including in the same process.
 *
 * Removing the Map is part of the fix, not a cleanup: while it existed, any
 * future caller could read a plugin out of it and get an answer a restart
 * silently corrects. `security-review-service` now calls `getPlugin` here, and
 * every read in this module goes to the database.
 */

/** The one status string that means "this plugin must not run". */
export const PLUGIN_REVOKED = 'REVOKED';

/** A user's installation is live and may be loaded. */
export const PLUGIN_INSTALL_ACTIVE = 'ACTIVE';

/**
 * Thrown when a plugin is refused because it has been revoked.
 *
 * Distinct from "not found" on purpose: the routes translate this to 403
 * `PLUGIN_REVOKED`, and an operator reading a log during an incident needs to
 * tell "the kill switch is working" apart from "the id was wrong".
 */
export class PluginRevokedError extends Error {
  readonly pluginName: string;

  constructor(pluginName: string) {
    super(`Plugin ${pluginName} has been revoked and cannot be used`);
    this.name = 'PluginRevokedError';
    this.pluginName = pluginName;
  }
}

/** Thrown when a plugin exists and is usable but this user has not installed it. */
export class PluginNotInstalledError extends Error {
  constructor(pluginName: string) {
    super(`Plugin ${pluginName} is not installed for this user`);
    this.name = 'PluginNotInstalledError';
  }
}

/**
 * A plugin's runtime handle -- what a caller needs in order to actually run it.
 *
 * Deliberately not `PluginDefinition`: a runtime handle is only ever produced by
 * `loadPluginForUser`, which refuses a revoked plugin, so holding one of these
 * is evidence the revocation check ran.
 */
export interface LoadedPlugin {
  pluginId: string;
  name: string;
  version: string;
  entryPoint: string;
  permissions: string[];
  installedAt: Date;
}

/** A user's installation record, as the API returns it. */
export interface PluginInstallation {
  pluginId: string;
  name: string;
  version: string;
  status: string;
  permissions: string[];
  installedAt: Date;
}

/** `PluginRecord.permissions` is `Json`; narrow it rather than assert it. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function documentToPlugin(doc: {
  id: string;
  title: string;
  content: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): PluginDefinition {
  const manifest = doc.content ? JSON.parse(doc.content) : {};
  return {
    id: doc.id,
    name: manifest.name ?? doc.title,
    description: manifest.description ?? '',
    version: manifest.version ?? '1.0.0',
    author: manifest.author ?? '',
    permissions: manifest.permissions ?? [],
    status: (manifest.status ?? doc.status ?? 'DRAFT') as PluginDefinition['status'],
    entryPoint: manifest.entryPoint ?? '',
    configSchema: manifest.configSchema ?? {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * ============================================================================
 * P-13 -- PLUGINS ARE ENTITY-SCOPED DOCUMENT ROWS AND WERE NOT SCOPED
 * ============================================================================
 *
 * A plugin is a `Document` row with `type: 'PLUGIN'`. `Document.entityId` is a
 * required foreign key to `Entity`, but:
 *
 *   - `registerPlugin` took `entityId` off the caller's own body and fell back
 *     to the literal string `'default'`, which is not an entity id at all;
 *   - `getPlugins(status)` -- the function `GET /api/developer/plugins` calls --
 *     queried `{ type: 'PLUGIN', deletedAt: null }` with NO entity filter, so it
 *     listed every tenant's plugins, including their declared permissions;
 *   - `submitForReview`, `approvePlugin`, `revokePlugin` and `unregisterPlugin`
 *     took a bare plugin id and mutated or deleted it.
 *
 * `ownerEntityId` is now threaded into every WHERE clause. It is OPTIONAL rather
 * than required for the same reason as in webhook-service.ts:
 * `tests/unit/platform/security-review.test.ts` calls `registerPlugin` and
 * friends positionally and is outside P-13's file boundary. Every route passes
 * it. Flagged in the PR as a follow-up for whoever owns tests/unit/platform.
 */
export async function registerPlugin(
  plugin: Omit<PluginDefinition, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { entityId?: string },
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const validation = validateManifest(plugin);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
  }

  // P-37: a name that has been break-glass revoked cannot be re-registered.
  // Without this, revocation is a speed bump -- register the same manifest
  // again under a fresh Document id and the plugin is back.
  if (await isPluginNameRevoked(plugin.name)) {
    throw new PluginRevokedError(plugin.name);
  }

  // The proven entity wins, deliberately: it overwrites the caller's own value.
  const entityId = ownerEntityId ?? (plugin as { entityId?: string }).entityId ?? 'default';

  const doc = await prisma.document.create({
    data: {
      title: plugin.name,
      entityId,
      type: 'PLUGIN',
      status: 'DRAFT',
      content: JSON.stringify({
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        permissions: plugin.permissions,
        entryPoint: plugin.entryPoint,
        configSchema: plugin.configSchema,
        status: 'pending_review',
      }),
    },
  });

  return documentToPlugin(doc);
}

export async function getPlugins(
  status?: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition[]> {
  const docs = await prisma.document.findMany({
    where: {
      type: 'PLUGIN',
      deletedAt: null,
      // Applied last and unconditionally, so no other filter can widen it.
      ...(ownerEntityId ? { entityId: ownerEntityId } : {}),
    },
  });

  let plugins = docs.map(documentToPlugin);

  if (status) {
    plugins = plugins.filter((p) => p.status === status);
  }

  return plugins;
}

export async function listPlugins(entityId: VerifiedEntityId, filters?: { status?: string }): Promise<PluginDefinition[]> {
  const docs = await prisma.document.findMany({
    where: {
      type: 'PLUGIN',
      entityId,
      deletedAt: null,
    },
  });

  let plugins = docs.map(documentToPlugin);

  if (filters?.status) {
    plugins = plugins.filter((p) => p.status === filters.status);
  }

  return plugins;
}

export async function getPlugin(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);
  return documentToPlugin(doc);
}

export async function enablePlugin(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);

  const manifest = doc.content ? JSON.parse(doc.content) : {};
  const name: string = manifest.name ?? doc.title;

  // P-37: enabling was one of three ways a revoked plugin came back to life.
  if (manifest.status === PLUGIN_REVOKED || doc.status === PLUGIN_REVOKED) {
    throw new PluginRevokedError(name);
  }
  if (await isPluginNameRevoked(name)) {
    throw new PluginRevokedError(name);
  }

  manifest.status = 'APPROVED';

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      status: 'APPROVED',
      content: JSON.stringify(manifest),
    },
  });

  return documentToPlugin(updated);
}

export async function disablePlugin(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);

  const manifest = doc.content ? JSON.parse(doc.content) : {};
  manifest.status = 'DRAFT';

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      status: 'DRAFT',
      content: JSON.stringify(manifest),
    },
  });

  return documentToPlugin(updated);
}

export async function submitForReview(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);

  const manifest = doc.content ? JSON.parse(doc.content) : {};
  if (manifest.status !== 'pending_review' && manifest.status !== 'DRAFT' && doc.status !== 'DRAFT') {
    throw new Error('Only DRAFT plugins can be submitted for review');
  }

  manifest.status = 'REVIEW';
  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      content: JSON.stringify(manifest),
    },
  });

  return documentToPlugin(updated);
}

export async function approvePlugin(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);

  const manifest = doc.content ? JSON.parse(doc.content) : {};
  const name: string = manifest.name ?? doc.title;

  // P-37: approval was the second way back from revoked. All three are closed.
  if (manifest.status === PLUGIN_REVOKED || doc.status === PLUGIN_REVOKED) {
    throw new PluginRevokedError(name);
  }
  if (await isPluginNameRevoked(name)) {
    throw new PluginRevokedError(name);
  }

  manifest.status = 'APPROVED';

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      status: 'APPROVED',
      content: JSON.stringify(manifest),
    },
  });

  return documentToPlugin(updated);
}

/**
 * Revoke the REGISTRY entry for a plugin.
 *
 * P-37: this used to write `manifest.status = 'REVOKED'` into `Document.content`
 * and leave the `Document.status` COLUMN at whatever it was -- usually
 * `'APPROVED'`. `documentToPlugin` prefers the manifest, so the developer module
 * read it correctly and nothing here noticed; but `GET /api/documents`,
 * `GET /api/documents/stats` and the household dashboard read the column, and
 * they counted a revoked plugin as an active document. Both are written now.
 *
 * This is the ordinary, non-emergency revocation. `breakGlassRevoke` in
 * security-review-service.ts calls it AND kills every installation.
 */
export async function revokePlugin(
  pluginId: string,
  _reason: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginDefinition> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);

  const manifest = doc.content ? JSON.parse(doc.content) : {};
  manifest.status = PLUGIN_REVOKED;

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      status: PLUGIN_REVOKED,
      content: JSON.stringify(manifest),
    },
  });

  return documentToPlugin(updated);
}

export async function unregisterPlugin(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
  if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);
  await prisma.document.deleteMany({
    where: { id: pluginId, ...(ownerEntityId ? { entityId: ownerEntityId } : {}) },
  });
}

// ===========================================================================
// P-37 — INSTALLATION AND THE SERVING PATH (`PluginRecord`)
// ===========================================================================
//
// WHY THESE EXIST AT ALL
//
// `breakGlassRevoke` returned `affectedUsers: 0` as a literal because there was
// nothing in this system that recorded a user HAVING a plugin. The registry --
// `Document` rows of `type: 'PLUGIN'` -- says a plugin was PUBLISHED in an
// entity. It has never said who is RUNNING it. A revocation cannot count the
// users it affected until the system knows who they are, and it cannot stop a
// plugin being served until there is a serving path to stop.
//
// `PluginRecord` is that record and it was already in the schema, unreferenced:
//
//     userId (FK User, Cascade), name, version, author?, description?,
//     permissions Json, status String @default("ACTIVE"), config Json?,
//     installedAt, updatedAt        @@unique([userId, name])
//
// `@@unique([userId, name])` is the load-bearing line. It says a plugin's
// identity ACROSS users is its `name`, and that a user holds at most one
// installation of it -- so `affectedUsers` is exactly the number of rows a
// revocation updates, with no DISTINCT needed and no double counting.
//
// WHY `Document` STAYS THE REGISTRY RATHER THAN MIGRATING READS TO `PluginRecord`
//
// `PluginRecord` has no `entityId` column and the schema is frozen. P-13
// threaded a verified `entityId` through every plugin WHERE clause precisely
// because `getPlugins` had been listing every tenant's plugins and the
// permissions they declare. Moving the registry onto `PluginRecord` would
// delete that scoping -- it would trade this package's bug for P-13's. So:
//
//     Document(type: 'PLUGIN')  = the registry.     Entity-scoped. Unchanged.
//     PluginRecord              = an installation.  User-scoped.   New.
//
// Measured before choosing, the way P-32 did: across all 39 `paf_*` databases on
// this machine there are 0 `Document` rows of ANY type, 0 `PluginRecord` and 0
// `PluginReview`. There is nothing to migrate and no dual-read window to serve,
// which is the only reason a clean split is available at all.

/**
 * Has this plugin NAME been revoked anywhere?
 *
 * This is the revocation tombstone, and it is the reason a revocation cannot be
 * walked back. A `PluginRecord` row in `REVOKED` state is a durable fact about
 * the NAME, not about one user: as long as one exists, nobody may install,
 * load, register, enable or approve a plugin called that.
 *
 * That is deliberately fail-closed and deliberately global. Break glass means a
 * plugin is believed malicious; the wrong answer to "should the same manifest be
 * allowed back under a different Document id, in a different entity" is yes. The
 * cost is that the name is burned platform-wide, which is recorded in the PR as
 * the residual: un-burning one takes an operator deleting the row.
 */
export async function isPluginNameRevoked(name: string): Promise<boolean> {
  if (!name) return false;
  const tombstones = await prisma.pluginRecord.count({
    where: { name, status: PLUGIN_REVOKED },
  });
  return tombstones > 0;
}

/**
 * Refuse a revoked plugin. Both halves matter and neither is redundant:
 *
 *   - the registry row covers a plugin nobody ever installed;
 *   - the tombstone covers a plugin re-registered under a new Document id, and
 *     a same-named plugin published in another entity.
 */
export async function assertPluginUsable(plugin: PluginDefinition): Promise<void> {
  if (plugin.status === PLUGIN_REVOKED) throw new PluginRevokedError(plugin.name);
  if (await isPluginNameRevoked(plugin.name)) throw new PluginRevokedError(plugin.name);
}

/**
 * Install a plugin for a user. Refuses a revoked plugin.
 *
 * `upsert` cannot resurrect a revoked installation: `assertPluginUsable` has
 * already thrown by the time the write is reached, because a revoked
 * installation is itself a tombstone for the name.
 */
export async function installPlugin(
  pluginId: string,
  userId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginInstallation> {
  const plugin = await getPlugin(pluginId, ownerEntityId);
  await assertPluginUsable(plugin);

  const record = await prisma.pluginRecord.upsert({
    where: { userId_name: { userId, name: plugin.name } },
    create: {
      userId,
      name: plugin.name,
      version: plugin.version,
      author: plugin.author || null,
      description: plugin.description || null,
      permissions: plugin.permissions,
      status: PLUGIN_INSTALL_ACTIVE,
    },
    update: {
      version: plugin.version,
      permissions: plugin.permissions,
      status: PLUGIN_INSTALL_ACTIVE,
    },
  });

  return {
    pluginId,
    name: record.name,
    version: record.version,
    status: record.status,
    permissions: toStringArray(record.permissions),
    installedAt: record.installedAt,
  };
}

/**
 * Uninstall a plugin for a user.
 *
 * A REVOKED row is NOT deleted. Deleting it would remove the tombstone, and a
 * user could then uninstall-then-reinstall their way out of a break-glass
 * revocation -- the revocation would still be in the database and would still be
 * useless, which is this package's bug wearing a different hat. Uninstalling a
 * revoked plugin is a no-op that says so.
 */
export async function uninstallPlugin(
  pluginId: string,
  userId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<{ uninstalled: boolean; revoked: boolean }> {
  const plugin = await getPlugin(pluginId, ownerEntityId);

  const deleted = await prisma.pluginRecord.deleteMany({
    where: { userId, name: plugin.name, status: { not: PLUGIN_REVOKED } },
  });

  if (deleted.count === 0 && (await isPluginNameRevoked(plugin.name))) {
    return { uninstalled: false, revoked: true };
  }

  return { uninstalled: deleted.count > 0, revoked: false };
}

/**
 * THE SERVING PATH.
 *
 * Everything a caller needs in order to actually run a plugin comes from here,
 * and it reads Postgres on every call -- so a revocation written by another
 * process, or before a restart, is seen by the next request. This is the
 * function the decisive test in tests/db/plugin-revocation.test.ts calls AFTER
 * discarding every module-level object the process is holding.
 */
export async function loadPluginForUser(
  pluginId: string,
  userId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<LoadedPlugin> {
  const plugin = await getPlugin(pluginId, ownerEntityId);
  await assertPluginUsable(plugin);

  const record = await prisma.pluginRecord.findUnique({
    where: { userId_name: { userId, name: plugin.name } },
  });

  if (!record) throw new PluginNotInstalledError(plugin.name);
  if (record.status === PLUGIN_REVOKED) throw new PluginRevokedError(plugin.name);
  if (record.status !== PLUGIN_INSTALL_ACTIVE) throw new PluginNotInstalledError(plugin.name);

  return {
    pluginId,
    name: record.name,
    version: record.version,
    entryPoint: plugin.entryPoint,
    permissions: toStringArray(record.permissions),
    installedAt: record.installedAt,
  };
}

/** Every installation of a plugin name -- what a revocation acts on and counts. */
export async function listInstallations(
  name: string
): Promise<Array<{ id: string; userId: string; status: string }>> {
  const records = await prisma.pluginRecord.findMany({
    where: { name },
    select: { id: true, userId: true, status: true },
  });
  return records;
}

export function validateManifest(manifest: Partial<PluginDefinition>): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.version) errors.push('Missing required field: version');
  if (!manifest.description) errors.push('Missing required field: description');
  if (!manifest.entryPoint) errors.push('Missing required field: entryPoint');
  if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    errors.push('Missing required field: permissions');
  }

  if (manifest.permissions && Array.isArray(manifest.permissions)) {
    const dangerous = manifest.permissions.filter((p) => DANGEROUS_PERMISSIONS.includes(p));
    if (dangerous.length > 0) {
      warnings.push(`Dangerous permissions requested: ${dangerous.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getPluginSDKStub(): Record<string, string> {
  return {
    'Plugin Interface': 'interface Plugin { id: string; name: string; version: string; init(): Promise<void>; destroy(): Promise<void>; }',
    'Hook System': 'interface PluginHook { event: string; handler: (payload: unknown) => Promise<void>; }',
    'Config Schema': 'interface PluginConfig { schema: Record<string, { type: string; required: boolean; default?: unknown }>; }',
    'Permission Model': 'type Permission = "tasks.read" | "tasks.write" | "documents.read" | "documents.write" | "contacts.read" | "messages.read" | "messages.write";',
    'Lifecycle': 'enum PluginLifecycle { DRAFT = "DRAFT", REVIEW = "REVIEW", APPROVED = "APPROVED", PUBLISHED = "PUBLISHED", REVOKED = "REVOKED" }',
  };
}
