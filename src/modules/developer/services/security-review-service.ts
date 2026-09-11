import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { PluginSecurityReview } from '../types';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import { getPlugin, PLUGIN_REVOKED } from './plugin-service';

/**
 * Registry-level review verdicts, still in memory.
 *
 * P-37 read the schema for a home and there is not one. `PluginReview` is the
 * only review table and its `pluginRecordId` is a REQUIRED foreign key to
 * `PluginRecord`, which is a per-user INSTALLATION. A review of a registry entry
 * nobody has installed has no `PluginRecord` to hang off, so moving this Map
 * onto `PluginReview` would mean either inventing a fake installation row for
 * every review or refusing to review an uninstalled plugin. Neither is honest,
 * and the schema is frozen for migration window 01.
 *
 * So this is a KNOWN remaining in-memory store, and it is named in the PR: a
 * verdict from `conductReview` does not survive a restart. That is a real defect
 * and it is not this package's -- what it costs is that a reviewer has to review
 * again, not that a malicious plugin keeps running. `breakGlassRevoke`, which is
 * the part that must survive, no longer touches it.
 */
const reviewStore = new Map<string, PluginSecurityReview>();

const DANGEROUS_PERMISSIONS = ['admin.all', 'system.execute', 'files.delete_all'];

/** What `breakGlassRevoke` writes into `PluginReview.findings`. */
interface ReviewFinding {
  severity: string;
  description: string;
}

export async function requestReview(
  pluginId: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginSecurityReview> {
  // P-37: was `pluginStore.get(pluginId)`. After a restart that Map is empty, so
  // requesting a review of a plugin that plainly exists in Postgres threw
  // "Plugin <id> not found" until somebody happened to re-register it.
  await getPlugin(pluginId, ownerEntityId);

  const review: PluginSecurityReview = {
    pluginId,
    reviewer: '',
    status: 'PENDING',
    permissionsVerified: false,
    isolationVerified: false,
    findings: [],
  };

  reviewStore.set(pluginId, review);
  return review;
}

export async function conductReview(
  pluginId: string,
  reviewer: string,
  ownerEntityId?: VerifiedEntityId
): Promise<PluginSecurityReview> {
  // P-37: same fix as requestReview. A security review that reads the plugin
  // manifest out of a process-local Map is reviewing whatever the last writer in
  // THIS process happened to leave there, not what is being served.
  const plugin = await getPlugin(pluginId, ownerEntityId);

  const findings: ReviewFinding[] = [];

  // Check permissions are minimal
  const dangerousPerms = plugin.permissions.filter((p) => DANGEROUS_PERMISSIONS.includes(p));
  if (dangerousPerms.length > 0) {
    findings.push({
      severity: 'HIGH',
      description: `Plugin requests dangerous permissions: ${dangerousPerms.join(', ')}`,
    });
  }

  const permissionsVerified = dangerousPerms.length === 0;

  // Check isolation (placeholder: verify entry point doesn't reference system paths)
  const isolationVerified = !plugin.entryPoint.includes('..') && !plugin.entryPoint.startsWith('/');
  if (!isolationVerified) {
    findings.push({
      severity: 'CRITICAL',
      description: 'Plugin entry point may escape sandbox isolation',
    });
  }

  if (plugin.permissions.length > 10) {
    findings.push({
      severity: 'MEDIUM',
      description: 'Plugin requests more than 10 permissions. Review for least privilege.',
    });
  }

  // AI-assisted security analysis
  try {
    const aiReview = await generateJSON<{ findings: ReviewFinding[] }>(
      `Perform a security review of this plugin.

Plugin: ${plugin.name} v${plugin.version}
Author: ${plugin.author}
Permissions: ${JSON.stringify(plugin.permissions)}
Entry Point: ${plugin.entryPoint}
Config Schema: ${JSON.stringify(plugin.configSchema)}

Analyze for:
1. Principle of least privilege - are permissions minimal and necessary?
2. Dangerous patterns - network access, file system access, credential access
3. Isolation enforcement - could the plugin escape its sandbox?
4. Configuration risks - could config values be exploited?

Return JSON: { "findings": [{ "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO", "description": "finding description" }] }
Only include genuine concerns, not trivial observations.`,
      { temperature: 0.1, maxTokens: 512 }
    );

    if (aiReview.findings && Array.isArray(aiReview.findings)) {
      for (const f of aiReview.findings) {
        // Avoid duplicating findings already detected by rule-based checks
        const isDuplicate = findings.some((existing) =>
          existing.description.toLowerCase().includes(f.description.toLowerCase().slice(0, 30))
        );
        if (!isDuplicate) {
          findings.push(f);
        }
      }
    }
  } catch {
    // Rule-based findings still apply if AI fails
  }

  const status = findings.some((f) => f.severity === 'CRITICAL') ? 'REJECTED' as const
    : findings.some((f) => f.severity === 'HIGH') ? 'REJECTED' as const
    : 'APPROVED' as const;

  const review: PluginSecurityReview = {
    pluginId,
    reviewer,
    status,
    permissionsVerified,
    isolationVerified,
    findings,
    reviewedAt: new Date(),
  };

  reviewStore.set(pluginId, review);
  return review;
}

export async function getReview(pluginId: string): Promise<PluginSecurityReview | null> {
  return reviewStore.get(pluginId) || null;
}

/** Who pulled the handle, and which registry entry they may act on. */
export interface BreakGlassOptions {
  /** The `User.id` of the operator. Required to write the revocation ledger. */
  revokedBy?: string;
  /** The caller's proven entity, so an operator can only revoke what they can see. */
  ownerEntityId?: VerifiedEntityId;
}

export interface BreakGlassResult {
  revoked: boolean;
  /** The plugin NAME the revocation applies to -- see the note on scope below. */
  pluginName: string;
  /**
   * Users whose live installation this call revoked. COUNTED, not asserted:
   * it is the number of `PluginRecord` rows this call moved out of a non-revoked
   * state, and `@@unique([userId, name])` guarantees one row per user, so the
   * row count IS the user count.
   */
  affectedUsers: number;
  revokedAt: Date;
  /** Registry entries and installations that now refuse to serve the plugin. */
  registryRevoked: boolean;
  ledgerEntries: number;
}

/**
 * ===========================================================================
 * P-37 — BREAK GLASS. THE THIRTEENTH "REPORTS SUCCESS FOR WORK THAT DID NOT
 * HAPPEN", AND THE FIRST ONE THAT IS A SECURITY CONTROL.
 * ===========================================================================
 *
 * What this function used to be, in full:
 *
 *     const plugin = pluginStore.get(pluginId);
 *     if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
 *     plugin.status = 'REVOKED';
 *     plugin.updatedAt = new Date();
 *     pluginStore.set(pluginId, plugin);
 *     // Placeholder: would query real user count
 *     return { revoked: true, affectedUsers: 0 };
 *
 * Three defects in six lines:
 *
 *   1. `pluginStore` is a module-level `Map`. A restart un-revokes the plugin
 *      and a second instance never saw the revocation at all.
 *   2. The plugins it revoked did not live there. `plugin-service` serves
 *      `Document` rows with the manifest JSON-stuffed into `Document.content`,
 *      so the Map entry and the thing being served were different objects and
 *      the revocation never reached the second one. It did not merely fail to
 *      persist; it never applied, in the same process, immediately.
 *   3. `affectedUsers: 0` was a literal. An operator running an emergency
 *      revocation was told nobody was affected, every single time.
 *
 * WHAT IT DOES NOW, AND WHY EACH PART IS NEEDED
 *
 *   a. The REGISTRY entry (`Document`) is revoked, in both the manifest and the
 *      `status` column. This stops the plugin being listed, enabled, approved or
 *      installed through the entity that published it.
 *   b. Every INSTALLATION (`PluginRecord`) of that plugin name is moved to
 *      `REVOKED`. This is what stops it being SERVED: `loadPluginForUser`
 *      refuses on it, and it is a row, so it survives the restart.
 *   c. If nobody had installed it, one REVOKED `PluginRecord` is written anyway,
 *      owned by the operator. That row is the tombstone: `isPluginNameRevoked`
 *      reads it, so the manifest cannot be re-registered under a fresh
 *      `Document` id in another entity and served again.
 *   d. A `PluginReview` row per affected installation records who revoked it,
 *      when, why, and the count -- the audit trail of an emergency action.
 *
 * All four in ONE transaction. A break-glass revocation that half-applied and
 * returned `{ revoked: true }` would be the same bug with more steps.
 *
 * SCOPE, STATED PLAINLY: THIS IS GLOBAL ACROSS USERS, PER REGISTRY ENTRY.
 *
 * MIGRATION WINDOW 02 CHANGED THIS PARAGRAPH, AND IT IS THE POINT OF THE
 * PACKAGE. What it used to say is kept here because it is the defect:
 *
 *     "THIS IS GLOBAL BY PLUGIN NAME. `PluginRecord` has no `entityId` and is
 *      unique on `(userId, name)`, so `name` is the only cross-user identity a
 *      plugin has in the frozen schema ... The cost is that two tenants
 *      publishing unrelated plugins under the same name share a kill switch.
 *      Closing that needs a `PluginRecord.registryId` column."
 *
 * Ivan's ruling: *"break-glass should scope to a specific plugin instance, not
 * a name"*. `PluginRecord.registryId` now exists, `installPlugin` writes it,
 * and the `where` below reads it. A malicious plugin still dies for EVERY user
 * who installed it -- that part was right and is unchanged, and it is why the
 * clause is not entity-scoped -- but it dies as one plugin rather than as a
 * string. Revoking tenant A's "Calendar Sync" leaves tenant B's "Calendar Sync"
 * installed, loadable and served, which `tests/db/migration-window-02.test.ts`
 * asserts from a second `PrismaClient` after a restart.
 *
 * THE LEGACY ARM OF THE `OR` IS NOT A LOOPHOLE. `registryId` is nullable, so
 * installations written before the migration have none; those are still matched
 * by name, because a revocation of a plugin whose installations cannot name
 * their registry entry has no narrower honest reading, and missing them would
 * be a revocation that fails to revoke. It cannot re-widen a new revocation:
 * every row `installPlugin` writes from here on carries a `registryId`, so the
 * `registryId: null` arm matches nothing that was written since.
 */
export async function breakGlassRevoke(
  pluginId: string,
  reason: string,
  options: BreakGlassOptions = {}
): Promise<BreakGlassResult> {
  // Resolve (and prove the caller may see) the registry entry first, so an
  // unknown id still throws before anything is written.
  const plugin = await getPlugin(pluginId, options.ownerEntityId);
  const revokedAt = new Date();
  const findings: ReviewFinding[] = [
    { severity: 'CRITICAL', description: `Break-glass revocation: ${reason}` },
  ];

  return prisma.$transaction(async (tx) => {
    // (a) the registry entry.
    const doc = await tx.document.findFirst({
      where: {
        id: pluginId,
        ...(options.ownerEntityId ? { entityId: options.ownerEntityId } : {}),
      },
    });
    if (!doc || doc.type !== 'PLUGIN') throw new Error(`Plugin ${pluginId} not found`);

    const manifest = doc.content ? JSON.parse(doc.content) : {};
    manifest.status = PLUGIN_REVOKED;
    await tx.document.update({
      where: { id: pluginId },
      data: { status: PLUGIN_REVOKED, content: JSON.stringify(manifest) },
    });

    // (b) every live installation OF THIS REGISTRY ENTRY. Read the ids first so
    // the ledger can name them and the count is of rows this call actually
    // moved -- a second `count()` afterwards would also count installations
    // revoked days ago.
    //
    // `affectedUsers` is `liveIds.length`, inside this transaction, and this
    // clause is what it counts. Narrowing the clause without saying so would
    // have quietly changed the number an operator reads during an incident, so:
    // it now counts the users who installed THIS plugin, and no longer counts
    // users who installed a different plugin with the same name.
    const scope = { OR: [{ registryId: pluginId }, { registryId: null, name: plugin.name }] };

    const live = await tx.pluginRecord.findMany({
      where: { ...scope, status: { not: PLUGIN_REVOKED } },
      select: { id: true },
    });
    const liveIds = live.map((r) => r.id);

    if (liveIds.length > 0) {
      await tx.pluginRecord.updateMany({
        where: { id: { in: liveIds } },
        data: { status: PLUGIN_REVOKED, updatedAt: revokedAt },
      });
    }

    // (c) the tombstone, only when there is nothing else carrying the fact.
    //     It carries `registryId` too -- a tombstone that did not would be read
    //     by `isPluginNameRevoked` as a LEGACY global burn and would kill every
    //     same-named plugin on the platform, which is the bug this package is
    //     closing arriving through the back door.
    const ledgerIds = [...liveIds];
    const existing = await tx.pluginRecord.count({ where: scope });
    if (existing === 0 && options.revokedBy) {
      const tombstone = await tx.pluginRecord.create({
        data: {
          userId: options.revokedBy,
          name: plugin.name,
          registryId: pluginId,
          version: plugin.version,
          author: plugin.author || null,
          description: plugin.description || null,
          permissions: plugin.permissions,
          status: PLUGIN_REVOKED,
        },
      });
      ledgerIds.push(tombstone.id);
    }

    // (d) the audit trail.
    if (ledgerIds.length > 0) {
      await tx.pluginReview.createMany({
        data: ledgerIds.map((pluginRecordId) => ({
          pluginRecordId,
          reviewerId: options.revokedBy ?? 'SYSTEM',
          status: PLUGIN_REVOKED,
          findings,
          revokedAt,
          affectedUsers: liveIds.length,
        })),
      });
    }

    return {
      revoked: true,
      pluginName: plugin.name,
      affectedUsers: liveIds.length,
      revokedAt,
      registryRevoked: true,
      ledgerEntries: ledgerIds.length,
    };
  });
}

/**
 * The revocation ledger for a plugin name, newest first.
 *
 * Exists so an operator can answer "was this actually revoked, by whom, and how
 * many users did it hit" from the database rather than from a return value that
 * scrolled past during an incident.
 */
export async function getRevocationLedger(
  pluginName: string
): Promise<Array<{ reviewerId: string; revokedAt: Date | null; affectedUsers: number; findings: unknown }>> {
  const rows = await prisma.pluginReview.findMany({
    where: { status: PLUGIN_REVOKED, pluginRecord: { name: pluginName } },
    orderBy: { createdAt: 'desc' },
    select: { reviewerId: true, revokedAt: true, affectedUsers: true, findings: true },
  });
  return rows;
}

export { reviewStore };
