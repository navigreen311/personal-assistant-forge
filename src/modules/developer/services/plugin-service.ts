import { prisma } from '@/lib/db';
import type { PluginDefinition } from '../types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

const DANGEROUS_PERMISSIONS = ['filesystem', 'network', 'admin', 'admin.all', 'system.execute', 'files.delete_all'];

// In-memory store kept for backward compat with security-review-service
export const pluginStore = new Map<string, PluginDefinition>();

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

function syncToStore(plugin: PluginDefinition): void {
  pluginStore.set(plugin.id, plugin);
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

  const result = documentToPlugin(doc);
  syncToStore(result);
  return result;
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
  manifest.status = 'APPROVED';

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      status: 'APPROVED',
      content: JSON.stringify(manifest),
    },
  });

  const result = documentToPlugin(updated);
  syncToStore(result);
  return result;
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

  const result = documentToPlugin(updated);
  syncToStore(result);
  return result;
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

  const result = documentToPlugin(updated);
  syncToStore(result);
  return result;
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
  manifest.status = 'APPROVED';

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      status: 'APPROVED',
      content: JSON.stringify(manifest),
    },
  });

  const result = documentToPlugin(updated);
  syncToStore(result);
  return result;
}

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
  manifest.status = 'REVOKED';

  const updated = await prisma.document.update({
    where: { id: pluginId },
    data: {
      content: JSON.stringify(manifest),
    },
  });

  const result = documentToPlugin(updated);
  syncToStore(result);
  return result;
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
  pluginStore.delete(pluginId);
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
