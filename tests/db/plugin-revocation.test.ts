/**
 * P-37 — BREAK GLASS. THE DECISIVE TEST.
 *
 * ============================================================================
 * WHAT WAS WRONG, AND WHY THE OLD TEST PASSED ANYWAY
 * ============================================================================
 *
 * `breakGlassRevoke` is the emergency revocation path for a malicious or
 * compromised plugin. It was six lines:
 *
 *     const plugin = pluginStore.get(pluginId);
 *     if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
 *     plugin.status = 'REVOKED';
 *     pluginStore.set(pluginId, plugin);
 *     return { revoked: true, affectedUsers: 0 };
 *
 * `pluginStore` was a module-level `Map`, so a restart un-revoked the plugin.
 * Worse, the plugins being SERVED did not live there: `plugin-service` reads
 * `Document` rows with the manifest JSON-stuffed into `Document.content`. So the
 * revocation did not merely fail to persist — it never reached the object being
 * served, in the same process, immediately. And `affectedUsers: 0` was a
 * literal, so an operator pulling the handle during an incident was always told
 * nobody was affected.
 *
 * The test that guarded it called `breakGlassRevoke` and then read the Map back.
 * That assertion is true of ANY implementation that mutates the object it was
 * handed, including one that does nothing else — which is what it was guarding.
 *
 * ============================================================================
 * SO THIS FILE ASSERTS THE THREE THINGS THAT MAP TEST COULD NOT
 * ============================================================================
 *
 *   1. The revocation is in Postgres, and a SECOND PrismaClient — a different
 *      process's view of the same rows — sees it.
 *   2. It survives a restart. `jest.resetModules()` is a restart expressed
 *      precisely: every module-level object the process holds is dropped and the
 *      next `import` rebuilds it from scratch. Anything that was only in memory
 *      does not come back.
 *   3. After that restart the plugin is REFUSED through the path a user's
 *      request actually takes — the route handler, re-imported fresh, with a
 *      real session, going through `withAuth` and `withEntityScope` exactly as
 *      it does in production.
 *
 * Requires a real Postgres. No skip.
 */

import { PrismaClient } from '@prisma/client';

import { db, setupTestDatabase } from '../helpers/db';
import { readJson, requestAs } from '../helpers/session';
import { createTenant, createUser, type Tenant } from '../helpers/factories';

setupTestDatabase();

jest.setTimeout(60_000);

/** A second client — a different process's view of the same rows. */
async function withSecondClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

/** The dynamic-segment context Next.js hands a route handler. */
function ctx(pluginId: string): { params: Promise<{ pluginId: string }> } {
  return { params: Promise.resolve({ pluginId }) };
}

const MANIFEST = {
  name: 'Contact Exfiltrator',
  description: 'Looks helpful',
  version: '1.0.0',
  author: 'evil.example',
  permissions: ['contacts.read'],
  entryPoint: 'index.js',
  configSchema: {},
};

describe('P-37 — a break-glass revocation survives a restart and stops the plugin being served', () => {
  let publisher: Tenant;

  beforeEach(async () => {
    publisher = await createTenant();
  });

  /** Publish a plugin through the real route. Returns its registry id. */
  async function registerPluginViaRoute(name = MANIFEST.name): Promise<string> {
    const { POST } = await import('@/app/api/developer/plugins/route');
    const res = await POST(
      requestAs(publisher, '/api/developer/plugins', {
        method: 'POST',
        query: { entityId: publisher.entity.id },
        body: { ...MANIFEST, name },
      })
    );
    expect(res.status).toBe(201);
    const body = await readJson<{ data: { id: string } }>(res);
    return body.data.id;
  }

  /** Pull the handle through the operator's real route. */
  async function breakGlassViaRoute(
    pluginId: string,
    reason = 'Exfiltrating contacts'
  ): Promise<Response> {
    const { POST } = await import('@/app/api/developer/plugins/route');
    return POST(
      requestAs(publisher, '/api/developer/plugins', {
        method: 'POST',
        query: { entityId: publisher.entity.id },
        body: { pluginId, action: 'break-glass', reason },
      })
    );
  }

  // =========================================================================
  // THE ONE THAT MATTERS
  // =========================================================================

  it('revoke → restart → the plugin is REFUSED through the route a user calls', async () => {
    const pluginId = await registerPluginViaRoute();

    // The user installs it and can load it. This is the "before" half: without
    // it, a 403 after the revocation would prove nothing, because the route
    // might refuse everybody.
    const route = await import('@/app/api/developer/plugins/[pluginId]/route');

    const installed = await route.POST(
      requestAs(publisher, `/api/developer/plugins/${pluginId}`, { method: 'POST' }),
      ctx(pluginId)
    );
    expect(installed.status).toBe(201);

    const served = await route.GET(
      requestAs(publisher, `/api/developer/plugins/${pluginId}`),
      ctx(pluginId)
    );
    expect(served.status).toBe(200);
    const servedBody = await readJson<{ data: { entryPoint: string; name: string } }>(served);
    expect(servedBody.data.entryPoint).toBe('index.js');

    // Two more users install it, so the revocation has users to affect.
    const { installPlugin } = await import('@/modules/developer/services/plugin-service');
    const second = await createUser();
    const third = await createUser();
    await installPlugin(pluginId, second.id);
    await installPlugin(pluginId, third.id);

    // BREAK GLASS.
    const revoked = await breakGlassViaRoute(pluginId);
    expect(revoked.status).toBe(200);
    const revokedBody = await readJson<{
      data: { revoked: boolean; affectedUsers: number; pluginName: string };
    }>(revoked);
    expect(revokedBody.data.revoked).toBe(true);
    // Counted, not asserted: three users held a live installation.
    expect(revokedBody.data.affectedUsers).toBe(3);

    // THE RESTART. Every Map, every cached singleton, every `let` initialised at
    // import — gone. The pre-restart `route` binding above is now a stale
    // object; holding it is the mistake that would make this file measure
    // nothing, so the next import is deliberately a fresh one.
    jest.resetModules();

    const afterRestart = await import('@/app/api/developer/plugins/[pluginId]/route');
    const refused = await afterRestart.GET(
      requestAs(publisher, `/api/developer/plugins/${pluginId}`),
      ctx(pluginId)
    );

    expect(refused.status).toBe(403);
    const refusedBody = await readJson<{ error: { code: string } }>(refused);
    expect(refusedBody.error.code).toBe('PLUGIN_REVOKED');
  });

  it('a second client — another process — sees the revocation on every row', async () => {
    const pluginId = await registerPluginViaRoute();
    const { installPlugin } = await import('@/modules/developer/services/plugin-service');
    const second = await createUser();
    await installPlugin(pluginId, publisher.user.id);
    await installPlugin(pluginId, second.id);

    await breakGlassViaRoute(pluginId);

    await withSecondClient(async (client) => {
      const registry = await client.document.findUnique({ where: { id: pluginId } });
      expect(registry?.status).toBe('REVOKED');
      expect(JSON.parse(registry?.content ?? '{}').status).toBe('REVOKED');

      const installs = await client.pluginRecord.findMany({ where: { name: MANIFEST.name } });
      expect(installs).toHaveLength(2);
      expect(installs.every((r) => r.status === 'REVOKED')).toBe(true);
    });
  });

  // =========================================================================
  // affectedUsers — COUNTED, NOT ASSERTED
  // =========================================================================

  it('counts affectedUsers, and reports 0 only when it counted 0', async () => {
    const { installPlugin } = await import('@/modules/developer/services/plugin-service');

    // Four installs.
    const busy = await registerPluginViaRoute('Busy Plugin');
    for (let i = 0; i < 4; i += 1) {
      const user = await createUser();
      await installPlugin(busy, user.id);
    }
    const busyRes = await breakGlassViaRoute(busy);
    const busyBody = await readJson<{ data: { affectedUsers: number } }>(busyRes);
    expect(busyBody.data.affectedUsers).toBe(4);

    // None. The old implementation returned 0 for BOTH of these, which is the
    // entire point of asserting them as a pair rather than separately.
    const quiet = await registerPluginViaRoute('Quiet Plugin');
    const quietRes = await breakGlassViaRoute(quiet);
    const quietBody = await readJson<{ data: { affectedUsers: number } }>(quietRes);
    expect(quietBody.data.affectedUsers).toBe(0);
  });

  it('writes a revocation ledger row per affected installation, naming who and why', async () => {
    const pluginId = await registerPluginViaRoute();
    const { installPlugin } = await import('@/modules/developer/services/plugin-service');
    const second = await createUser();
    await installPlugin(pluginId, publisher.user.id);
    await installPlugin(pluginId, second.id);

    await breakGlassViaRoute(pluginId, 'Reading contacts it never declared');

    const ledger = await db.pluginReview.findMany({
      where: { pluginRecord: { name: MANIFEST.name } },
    });
    expect(ledger).toHaveLength(2);
    for (const row of ledger) {
      expect(row.status).toBe('REVOKED');
      expect(row.reviewerId).toBe(publisher.user.id);
      expect(row.revokedAt).toBeInstanceOf(Date);
      expect(row.affectedUsers).toBe(2);
      expect(JSON.stringify(row.findings)).toContain('Reading contacts it never declared');
    }
  });

  // =========================================================================
  // THE WAYS A REVOCATION COULD HAVE BEEN WALKED BACK
  // =========================================================================

  it('leaves a tombstone when nobody had installed it, so the name cannot be re-registered', async () => {
    const pluginId = await registerPluginViaRoute();
    await breakGlassViaRoute(pluginId);

    // The tombstone is a real row, not a flag in memory.
    const tombstones = await db.pluginRecord.findMany({
      where: { name: MANIFEST.name, status: 'REVOKED' },
    });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].userId).toBe(publisher.user.id);

    // Re-publishing the same manifest under a fresh Document id — the obvious
    // way back in, and it would have worked against the registry check alone.
    const { POST } = await import('@/app/api/developer/plugins/route');
    const again = await POST(
      requestAs(publisher, '/api/developer/plugins', {
        method: 'POST',
        query: { entityId: publisher.entity.id },
        body: MANIFEST,
      })
    );
    expect(again.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(again)).error.code).toBe('PLUGIN_REVOKED');
  });

  it('refuses to install a revoked plugin, and refuses to re-approve it', async () => {
    const pluginId = await registerPluginViaRoute();
    await breakGlassViaRoute(pluginId);

    const route = await import('@/app/api/developer/plugins/[pluginId]/route');
    const install = await route.POST(
      requestAs(publisher, `/api/developer/plugins/${pluginId}`, { method: 'POST' }),
      ctx(pluginId)
    );
    expect(install.status).toBe(403);

    const { POST } = await import('@/app/api/developer/plugins/route');
    const approve = await POST(
      requestAs(publisher, '/api/developer/plugins', {
        method: 'POST',
        query: { entityId: publisher.entity.id },
        body: { pluginId, action: 'approve' },
      })
    );
    expect(approve.status).toBe(403);
  });

  it('does not let uninstall delete the tombstone and let the plugin back in', async () => {
    const pluginId = await registerPluginViaRoute();
    const { installPlugin } = await import('@/modules/developer/services/plugin-service');
    await installPlugin(pluginId, publisher.user.id);
    await breakGlassViaRoute(pluginId);

    const route = await import('@/app/api/developer/plugins/[pluginId]/route');
    const uninstall = await route.DELETE(
      requestAs(publisher, `/api/developer/plugins/${pluginId}`, { method: 'DELETE' }),
      ctx(pluginId)
    );
    expect(uninstall.status).toBe(403);

    // The row is still there, still REVOKED, and still refusing.
    const rows = await db.pluginRecord.findMany({ where: { name: MANIFEST.name } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('REVOKED');

    const reinstall = await route.POST(
      requestAs(publisher, `/api/developer/plugins/${pluginId}`, { method: 'POST' }),
      ctx(pluginId)
    );
    expect(reinstall.status).toBe(403);
  });

  // =========================================================================
  // THE ORDINARY PATH STILL WORKS — so the fix is not "refuse everything"
  // =========================================================================

  it('a plugin that was NOT revoked still installs, loads and uninstalls', async () => {
    const pluginId = await registerPluginViaRoute('Harmless Plugin');
    const route = await import('@/app/api/developer/plugins/[pluginId]/route');
    const req = () => requestAs(publisher, `/api/developer/plugins/${pluginId}`, { method: 'POST' });

    expect((await route.POST(req(), ctx(pluginId))).status).toBe(201);
    expect(
      (await route.GET(requestAs(publisher, `/api/developer/plugins/${pluginId}`), ctx(pluginId)))
        .status
    ).toBe(200);
    expect(
      (
        await route.DELETE(
          requestAs(publisher, `/api/developer/plugins/${pluginId}`, { method: 'DELETE' }),
          ctx(pluginId)
        )
      ).status
    ).toBe(200);

    // Revoking a DIFFERENT plugin must not reach this one.
    const other = await registerPluginViaRoute('Something Else');
    await breakGlassViaRoute(other);
    expect((await route.POST(req(), ctx(pluginId))).status).toBe(201);
  });

  it('refuses an unauthenticated caller before it reaches the database', async () => {
    const pluginId = await registerPluginViaRoute();
    const route = await import('@/app/api/developer/plugins/[pluginId]/route');
    const { anonymousRequest } = await import('../helpers/session');

    const res = await route.GET(
      anonymousRequest(`/api/developer/plugins/${pluginId}`),
      ctx(pluginId)
    );
    expect(res.status).toBe(401);
  });
});
