/**
 * P-40 — THE THREE COLUMNS OF MIGRATION WINDOW 02, PROVED ACROSS A RESTART.
 *
 * ============================================================================
 * WHY THIS FILE HAS TO BE MORE THAN WINDOW 01's
 * ============================================================================
 *
 * The rule this file exists to satisfy has been sharpened twice, by two
 * packages, and both sharpenings are in the assertions below.
 *
 *   P-33 found FIVE of 75 Prisma models referenced nowhere in `src/`, and
 *   `control-plane-schema.test.ts` stayed green over every one of them, because
 *   it only counted tables.
 *
 *   P-36 made that test assert REFERENCE.
 *
 *   P-38 then proved reference is not sufficient: `VaultEntry`, `VaultSecret`,
 *   `VaultKey` and `ProvenanceRecord` all PASS the reference check, because a
 *   dead service names them about thirty times, and no row can ever be written
 *   to any of them.
 *
 * So a column is not done when it exists, and it is not done when something
 * mentions it either. It is done when the code path that needs it WRITES it and
 * the code that acts on it READS it. Each of the three sections below drives a
 * real route, discards every module-level object the process holds, and reads
 * the value back through code re-imported from scratch and through a second
 * `PrismaClient` — a different process's view of the same rows.
 *
 * ============================================================================
 * THE THREE BARS, AND WHERE EACH IS ASSERTED
 * ============================================================================
 *
 *  1. `PluginRecord.registryId` MUST ACTUALLY NARROW BREAK-GLASS. A column that
 *     exists while revocation still matches on `name` is worse than no column,
 *     because it looks fixed.
 *       -> "two tenants, same plugin name: revoking one leaves the other
 *          serving", plus the `affectedUsers` count, which must narrow WITH it.
 *
 *  2. `ShadowConsentReceipt.userId` MUST SURVIVE DETACHMENT.
 *       -> "the erasure request deletes the session and the retained receipt
 *          still names its user", through the real GDPR routes, and then
 *          through Article 15 export, which is the code that acts on it.
 *
 *  3. `ContactCallPreference.quietHoursTimezone` MUST BE HONOURED ON READ, not
 *     merely stored. A stored-but-unread column is `DNDConfig.reason` again —
 *     the field window 01 had to add `expiresAt` for, because no timed
 *     do-not-disturb had ever expired.
 *       -> "a contact's quiet hours are computed in the CONTACT's zone", with a
 *          matched pair of instants that fail in OPPOSITE directions if the
 *          caller's zone is used instead.
 *
 * ============================================================================
 * WHAT A RESTART IS, HERE
 * ============================================================================
 *
 * `jest.resetModules()`, the idiom P-01, P-09, P-20, P-33, P-36 and P-37
 * established: every Map, every Set, every `let` initialised at import is gone
 * and the next `import` rebuilds it empty. Anything that was only in memory
 * does not come back; anything in Postgres does.
 *
 * Requires a real Postgres. There is deliberately no skip.
 */

import { PrismaClient } from '@prisma/client';

import { db, setupTestDatabase } from '../helpers/db';
import { readJson, requestAs } from '../helpers/session';
import { createContact, createTenant, createUser, type Tenant } from '../helpers/factories';
import { verifyEntityForUser, type VerifiedEntityId } from '@/shared/middleware/auth';

setupTestDatabase();

jest.setTimeout(120_000);

/** A second client — a different process's view of the same rows. */
async function withSecondClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

/**
 * The brand, minted by the PRODUCTION function against the real database.
 *
 * `verifiedEntityIdForTest` in `tests/helpers/factories.ts` says in its own
 * doc-comment that it is for unit tests only and that a `tests/db` file should
 * prove ownership for real. `verifyEntityForUser` is what `withEntityScope`
 * itself calls, so a test that goes through it cannot pass on an entity the
 * user does not own.
 */
async function scopeFor(tenant: Tenant): Promise<VerifiedEntityId> {
  const scoped = await verifyEntityForUser(tenant.entity.id, tenant.user.id);
  if (!scoped) throw new Error('verifyEntityForUser refused a tenant it owns');
  return scoped;
}

// ===========================================================================
// 1. `PluginRecord.registryId` — BREAK GLASS SCOPES TO A PLUGIN, NOT A STRING
// ===========================================================================
//
// Ivan's ruling: *"break-glass should scope to a specific plugin instance, not
// a name"*.
//
// P-37 shipped break-glass keyed on plugin `name` and said so: `PluginRecord`
// had no `entityId` and is unique on `(userId, name)`, so `name` was the only
// cross-user identity a plugin had. The consequence was invisible because every
// path was fail-closed — a second tenant's unrelated plugin of the same name
// simply stopped being served, permanently, and the only evidence was somebody
// else's incident.
//
// THE DECISIVE SHAPE IS TWO TENANTS AND ONE NAME. A test with one tenant passes
// identically against the name-keyed version, which is exactly why P-37's suite
// — a good suite, with a restart-proof harness this file reuses — could not see
// it. Every plugin in it was called "Contact Exfiltrator" and there was only
// ever one publisher.

const MANIFEST = {
  description: 'Syncs calendars',
  version: '1.0.0',
  author: 'someone.example',
  permissions: ['calendar.read'],
  entryPoint: 'index.js',
  configSchema: {},
};

/** The collision. One string, two unrelated plugins, two unrelated tenants. */
const SHARED_NAME = 'Calendar Sync';

/** The dynamic-segment context Next.js hands a route handler. */
function pluginCtx(pluginId: string): { params: Promise<{ pluginId: string }> } {
  return { params: Promise.resolve({ pluginId }) };
}

/** Publish a plugin through the real route, as this tenant. Returns its id. */
async function publish(tenant: Tenant, name: string): Promise<string> {
  const { POST } = await import('@/app/api/developer/plugins/route');
  const res = await POST(
    requestAs(tenant, '/api/developer/plugins', {
      method: 'POST',
      query: { entityId: tenant.entity.id },
      body: { ...MANIFEST, name },
    })
  );
  expect(res.status).toBe(201);
  const body = await readJson<{ data: { id: string } }>(res);
  return body.data.id;
}

/** Install, through the real route, for the calling tenant's own user. */
async function install(tenant: Tenant, pluginId: string): Promise<Response> {
  const route = await import('@/app/api/developer/plugins/[pluginId]/route');
  return route.POST(
    requestAs(tenant, `/api/developer/plugins/${pluginId}`, { method: 'POST' }),
    pluginCtx(pluginId)
  );
}

/** Load — the serving path. 200 means the plugin is being served. */
async function load(tenant: Tenant, pluginId: string): Promise<Response> {
  const route = await import('@/app/api/developer/plugins/[pluginId]/route');
  return route.GET(
    requestAs(tenant, `/api/developer/plugins/${pluginId}`),
    pluginCtx(pluginId)
  );
}

/** Pull the handle, through the operator's real route. */
async function breakGlass(tenant: Tenant, pluginId: string, reason = 'Exfiltrating contacts') {
  const { POST } = await import('@/app/api/developer/plugins/route');
  return POST(
    requestAs(tenant, '/api/developer/plugins', {
      method: 'POST',
      query: { entityId: tenant.entity.id },
      body: { pluginId, action: 'break-glass', reason },
    })
  );
}

describe('window 02 / 1 — break-glass scopes to a registry entry, not a plugin name', () => {
  let alpha: Tenant;
  let beta: Tenant;

  beforeEach(async () => {
    alpha = await createTenant();
    beta = await createTenant();
  });

  // =========================================================================
  // THE BAR
  // =========================================================================

  it('two tenants publish the same NAME: revoking one leaves the other serving, across a restart', async () => {
    const alphaPlugin = await publish(alpha, SHARED_NAME);
    const betaPlugin = await publish(beta, SHARED_NAME);

    // Two different plugins. Same string.
    expect(alphaPlugin).not.toBe(betaPlugin);

    expect((await install(alpha, alphaPlugin)).status).toBe(201);
    expect((await install(beta, betaPlugin)).status).toBe(201);

    // The "before" half. Without it a 200 after the revocation would prove
    // nothing, because the route might be serving everybody.
    expect((await load(alpha, alphaPlugin)).status).toBe(200);
    expect((await load(beta, betaPlugin)).status).toBe(200);

    // BREAK GLASS on ALPHA's plugin only.
    const revoked = await breakGlass(alpha, alphaPlugin);
    expect(revoked.status).toBe(200);
    const revokedBody = await readJson<{
      data: { revoked: boolean; affectedUsers: number; pluginName: string };
    }>(revoked);
    expect(revokedBody.data.revoked).toBe(true);
    expect(revokedBody.data.pluginName).toBe(SHARED_NAME);

    // ONE user held an installation of THIS plugin. Two users held an
    // installation of something called "Calendar Sync", and the name-keyed
    // version reported 2 — so this number is the narrowing, stated as a number.
    // `affectedUsers` is `liveIds.length` inside the revocation transaction;
    // narrowing the WHERE without checking the count would have quietly changed
    // what an operator reads during an incident.
    expect(revokedBody.data.affectedUsers).toBe(1);

    // THE RESTART. Every module-level object the process holds is discarded, so
    // the answers below come from Postgres or not at all.
    jest.resetModules();

    // Alpha's plugin is dead, through the route a user's request takes.
    const refused = await load(alpha, alphaPlugin);
    expect(refused.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(refused)).error.code).toBe(
      'PLUGIN_REVOKED'
    );

    // AND BETA'S IS STILL SERVING. This is the assertion the whole column is
    // for: before `registryId` it was a 403, because the kill switch was the
    // string "Calendar Sync".
    const stillServing = await load(beta, betaPlugin);
    expect(stillServing.status).toBe(200);
    const served = await readJson<{ data: { name: string; entryPoint: string } }>(stillServing);
    expect(served.data.name).toBe(SHARED_NAME);
    expect(served.data.entryPoint).toBe('index.js');

    // From another process's view of the rows: the column is written, and it is
    // what distinguishes the two installations.
    await withSecondClient(async (client) => {
      const rows = await client.pluginRecord.findMany({
        where: { name: SHARED_NAME },
        orderBy: { installedAt: 'asc' },
      });
      expect(rows).toHaveLength(2);

      const alphaRow = rows.find((r) => r.registryId === alphaPlugin);
      const betaRow = rows.find((r) => r.registryId === betaPlugin);
      expect(alphaRow?.status).toBe('REVOKED');
      expect(betaRow?.status).toBe('ACTIVE');

      // Neither row is relying on a null: both name their registry entry.
      expect(rows.every((r) => r.registryId !== null)).toBe(true);

      // And only ALPHA's registry Document was revoked.
      expect((await client.document.findUnique({ where: { id: alphaPlugin } }))?.status).toBe(
        'REVOKED'
      );
      expect((await client.document.findUnique({ where: { id: betaPlugin } }))?.status).not.toBe(
        'REVOKED'
      );
    });
  });

  it('the NAME is not burned platform-wide: the other tenant can still publish and install it', async () => {
    // Nobody installs alpha's, so the revocation writes a TOMBSTONE — the row
    // that used to burn the name for everyone.
    const alphaPlugin = await publish(alpha, SHARED_NAME);
    expect((await breakGlass(alpha, alphaPlugin)).status).toBe(200);

    const tombstones = await db.pluginRecord.findMany({
      where: { name: SHARED_NAME, status: 'REVOKED' },
    });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].userId).toBe(alpha.user.id);
    // The tombstone names its registry entry. A tombstone with a null
    // `registryId` would be read as a LEGACY global burn and would kill every
    // same-named plugin on the platform — this package's bug arriving by the
    // back door.
    expect(tombstones[0].registryId).toBe(alphaPlugin);

    jest.resetModules();

    // BETA publishes "Calendar Sync" for the first time, AFTER the revocation.
    const betaPlugin = await publish(beta, SHARED_NAME);
    expect((await install(beta, betaPlugin)).status).toBe(201);
    expect((await load(beta, betaPlugin)).status).toBe(200);

    // And the hole P-37 closed is still closed: re-publishing the revoked
    // manifest in ALPHA's own entity, under a fresh Document id, is refused.
    const { POST } = await import('@/app/api/developer/plugins/route');
    const again = await POST(
      requestAs(alpha, '/api/developer/plugins', {
        method: 'POST',
        query: { entityId: alpha.entity.id },
        body: { ...MANIFEST, name: SHARED_NAME },
      })
    );
    expect(again.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(again)).error.code).toBe('PLUGIN_REVOKED');
  });

  it('still kills EVERY user of the revoked plugin — the part P-37 got right', async () => {
    // Break glass is global across users by design: a malicious plugin must die
    // everywhere, not in the tenant that noticed. Narrowing by registry entry
    // must not have narrowed it to one user, so this is the control case that
    // would catch an over-correction.
    const alphaPlugin = await publish(alpha, SHARED_NAME);
    const betaPlugin = await publish(beta, SHARED_NAME);

    const { installPlugin } = await import('@/modules/developer/services/plugin-service');
    const strangers = [await createUser(), await createUser(), await createUser()];
    for (const stranger of strangers) {
      await installPlugin(alphaPlugin, stranger.id);
    }
    await installPlugin(betaPlugin, (await createUser()).id);

    const res = await breakGlass(alpha, alphaPlugin);
    const body = await readJson<{ data: { affectedUsers: number } }>(res);
    // Three users of alpha's plugin. NOT four: the fourth installed beta's.
    expect(body.data.affectedUsers).toBe(3);

    jest.resetModules();

    await withSecondClient(async (client) => {
      const alphaRows = await client.pluginRecord.findMany({ where: { registryId: alphaPlugin } });
      expect(alphaRows).toHaveLength(3);
      expect(alphaRows.every((r) => r.status === 'REVOKED')).toBe(true);

      const betaRows = await client.pluginRecord.findMany({ where: { registryId: betaPlugin } });
      expect(betaRows).toHaveLength(1);
      expect(betaRows[0].status).toBe('ACTIVE');
    });

    // The ledger still names who, why, and how many — with the narrowed count.
    const { getRevocationLedger } = await import(
      '@/modules/developer/services/security-review-service'
    );
    const ledger = await getRevocationLedger(SHARED_NAME);
    expect(ledger).toHaveLength(3);
    for (const row of ledger) {
      expect(row.reviewerId).toBe(alpha.user.id);
      expect(row.affectedUsers).toBe(3);
    }
  });

  it('a LEGACY installation — registryId null — is still revoked by name', async () => {
    // `registryId` is nullable, so rows written before this migration have
    // none. Those revocations were global by name when they were made, and
    // missing them would be a revocation that fails to revoke. This row is
    // written directly because no code path can produce one any more, which is
    // the point: the only pre-migration shape left is one a test must forge.
    const alphaPlugin = await publish(alpha, SHARED_NAME);
    const legacyUser = await createUser();
    await db.pluginRecord.create({
      data: {
        userId: legacyUser.id,
        name: SHARED_NAME,
        version: '1.0.0',
        permissions: MANIFEST.permissions,
        status: 'ACTIVE',
        // registryId deliberately left null — this is a pre-window-02 row.
      },
    });

    const res = await breakGlass(alpha, alphaPlugin);
    const body = await readJson<{ data: { affectedUsers: number } }>(res);
    expect(body.data.affectedUsers).toBe(1);

    const legacyRow = await db.pluginRecord.findUnique({
      where: { userId_name: { userId: legacyUser.id, name: SHARED_NAME } },
    });
    expect(legacyRow?.status).toBe('REVOKED');
    expect(legacyRow?.registryId).toBeNull();
  });

  it('a LEGACY tombstone keeps its global burn, because it named no plugin', async () => {
    // The other direction of the same rule. A revocation made before the column
    // existed cannot be narrowed retroactively without un-revoking a plugin
    // somebody killed on purpose, so `isPluginNameRevoked` still honours a
    // null-registryId tombstone globally — and the serving path still refuses.
    const betaPlugin = await publish(beta, SHARED_NAME);
    expect((await install(beta, betaPlugin)).status).toBe(201);
    expect((await load(beta, betaPlugin)).status).toBe(200);

    const operator = await createUser();
    await db.pluginRecord.create({
      data: {
        userId: operator.id,
        name: SHARED_NAME,
        version: '1.0.0',
        permissions: MANIFEST.permissions,
        status: 'REVOKED',
      },
    });

    jest.resetModules();
    const refused = await load(beta, betaPlugin);
    expect(refused.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(refused)).error.code).toBe(
      'PLUGIN_REVOKED'
    );
  });

  it('a re-install re-stamps registryId, so the next revocation cannot miss the row', async () => {
    // A stale `registryId` is the failure mode the column is supposed to end:
    // an installation pointing at the wrong registry entry is an installation a
    // revocation does not reach.
    const alphaPlugin = await publish(alpha, SHARED_NAME);
    const user = await createUser();

    const { installPlugin } = await import('@/modules/developer/services/plugin-service');
    await installPlugin(alphaPlugin, user.id);
    // Forge the pre-migration state on a live row, then re-install.
    await db.pluginRecord.update({
      where: { userId_name: { userId: user.id, name: SHARED_NAME } },
      data: { registryId: null },
    });
    await installPlugin(alphaPlugin, user.id);

    const row = await db.pluginRecord.findUnique({
      where: { userId_name: { userId: user.id, name: SHARED_NAME } },
    });
    expect(row?.registryId).toBe(alphaPlugin);
  });
});

// ===========================================================================
// 2. `ShadowConsentReceipt.userId` — A RECEIPT THAT OUTLIVES ITS SESSION STILL
//    NAMES THE PERSON WHO AUTHORISED THE ACTION
// ===========================================================================
//
// Ivan's ruling, and his framing: *"a receipt you can't attribute to a user
// defeats the entire audit trail. THIS ONE IS A BUG FIX, NOT A FEATURE."*
//
// P-17 made receipts outlive their session, which was right — v3 Addition 9.3
// retains them for regulatory compliance while the transcript is erased. That
// exposed the defect: the only links a receipt had to a person were
// `sessionId`, which `ON DELETE SET NULL` clears the moment the session goes,
// and `entityId`, which `core.ts` writes as `activeEntity?.id ?? null`. A
// retained receipt with neither named nobody — kept for seven years under
// Article 17(3)(b) and invisible under Article 15 at the same time.
//
// EVERY STEP BELOW IS A REAL ROUTE. The receipt is written by
// `POST /api/shadow/action`, detached by `POST /api/shadow/delete-session/[id]`
// — the user's own erasure request — and read back by `POST /api/shadow/export`,
// which is Article 15. Calling `createReceipt()` and then reading the row would
// prove the column can hold a string; it would not prove the attribution
// survives the thing that destroys it.

/** A session with NO active entity — the receipt this ruling is about. */
async function openEntitylessSession(tenant: Tenant) {
  return db.shadowVoiceSession.create({
    data: { userId: tenant.user.id, status: 'active', currentChannel: 'web' },
  });
}

/** Confirm an action card through the real route. `create_task` needs no step-up. */
async function confirmAction(tenant: Tenant, sessionId: string) {
  const { POST } = await import('@/app/api/shadow/action/route');
  return POST(
    requestAs(tenant, '/api/shadow/action', {
      method: 'POST',
      body: {
        sessionId,
        actionId: 'confirm-create_task-1789000000000',
        response: 'confirm:create_task',
      },
    })
  );
}

interface ExportedReceipt {
  id: string;
  userId: string | null;
  sessionId: string | null;
  entityId: string | null;
  actionType: string;
}

/** Article 15, through the real route. */
async function exportUserData(tenant: Tenant): Promise<{ consentReceipts: ExportedReceipt[] }> {
  const { POST } = await import('@/app/api/shadow/export/route');
  const res = await POST(requestAs(tenant, '/api/shadow/export', { method: 'POST' }));
  expect(res.status).toBe(200);
  const body = await readJson<{
    data: { data: { consentReceipts: ExportedReceipt[] } };
  }>(res);
  return body.data.data;
}

describe('window 02 / 2 — a consent receipt survives detachment still naming its user', () => {
  let tenant: Tenant;

  beforeEach(async () => {
    tenant = await createTenant();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-db-suite';
  });

  // =========================================================================
  // THE BAR
  // =========================================================================

  it('the erasure request deletes the session; the retained receipt still names its user', async () => {
    const voiceSession = await openEntitylessSession(tenant);

    const confirmed = await confirmAction(tenant, voiceSession.id);
    expect(confirmed.status).toBe(200);
    const receiptId = (
      await readJson<{ data: { receiptId: string; confirmed: boolean } }>(confirmed)
    ).data.receiptId;
    expect(receiptId).toBeTruthy();

    // WRITTEN by the route, from the authenticated caller. Asserted before the
    // deletion so a null afterwards cannot be read as "it was never written".
    const before = await db.shadowConsentReceipt.findUnique({ where: { id: receiptId } });
    expect(before?.userId).toBe(tenant.user.id);
    expect(before?.sessionId).toBe(voiceSession.id);
    // The case the ruling is about: no entity, so `entityId` cannot stand in.
    expect(before?.entityId).toBeNull();

    // THE ERASURE REQUEST — the real route, the real GDPR service.
    const { POST: deleteSession } = await import('@/app/api/shadow/delete-session/[id]/route');
    const deleted = await deleteSession(
      requestAs(tenant, `/api/shadow/delete-session/${voiceSession.id}`, { method: 'POST' }),
      { params: Promise.resolve({ id: voiceSession.id }) }
    );
    expect(deleted.status).toBe(200);

    // The session is gone. That is what P-17 built and it is correct.
    expect(
      await db.shadowVoiceSession.findUnique({ where: { id: voiceSession.id } })
    ).toBeNull();

    // THE RESTART, and then the whole ruling in three assertions, read by a
    // client that never saw any of the writes.
    jest.resetModules();

    await withSecondClient(async (client) => {
      const after = await client.shadowConsentReceipt.findUnique({ where: { id: receiptId } });

      // The receipt is RETAINED (Addition 9.3, Article 17(3)(b))...
      expect(after).not.toBeNull();
      // ...DETACHED, by the ON DELETE SET NULL the schema has always had...
      expect(after?.sessionId).toBeNull();
      expect(after?.entityId).toBeNull();
      // ...AND STILL NAMES ITS USER. Before this column, the three lines above
      // were the entire state of the row, and it was attributable to nobody.
      expect(after?.userId).toBe(tenant.user.id);

      // The receipt is still a receipt: the erasure scrubbed the conversation
      // content and kept the safety metadata, which is what it is retained for.
      expect(after?.actionType).toBe('create_task');
      expect(after?.confirmationLevel).toBe('NONE');
    });
  });

  it('Article 15 finds that receipt — the code that acts on the attribution', async () => {
    const voiceSession = await openEntitylessSession(tenant);
    const confirmed = await confirmAction(tenant, voiceSession.id);
    expect(confirmed.status).toBe(200);
    const receiptId = (await readJson<{ data: { receiptId: string } }>(confirmed)).data.receiptId;

    const { POST: deleteSession } = await import('@/app/api/shadow/delete-session/[id]/route');
    expect(
      (
        await deleteSession(
          requestAs(tenant, `/api/shadow/delete-session/${voiceSession.id}`, { method: 'POST' }),
          { params: Promise.resolve({ id: voiceSession.id }) }
        )
      ).status
    ).toBe(200);

    jest.resetModules();

    // `exportUserData` had two arms before this window — `session: { userId }`,
    // which the deletion just severed, and `entityId IN (owned)`, which cannot
    // reach a receipt with no entity. P-17's escalation named this exact row as
    // the one its workaround could not fix. WITHOUT the `{ userId }` arm this
    // array is empty.
    const exported = await exportUserData(tenant);
    const found = exported.consentReceipts.find((r) => r.id === receiptId);

    expect(found).toBeDefined();
    expect(found?.userId).toBe(tenant.user.id);
    expect(found?.sessionId).toBeNull();
    expect(found?.entityId).toBeNull();
  });

  it('does not export another user\'s receipt — the attribution narrows as well as widens', async () => {
    // A column that makes a receipt findable must not make it findable by
    // everybody. Asserted because the cheapest way to pass the test above is a
    // query that has stopped filtering.
    const other = await createTenant();
    const voiceSession = await openEntitylessSession(other);
    const confirmed = await confirmAction(other, voiceSession.id);
    expect(confirmed.status).toBe(200);
    const receiptId = (await readJson<{ data: { receiptId: string } }>(confirmed)).data.receiptId;

    const exported = await exportUserData(tenant);
    expect(exported.consentReceipts.map((r) => r.id)).not.toContain(receiptId);

    // And the owner still gets it, so the refusal above is not "exports nothing".
    const theirs = await exportUserData(other);
    expect(theirs.consentReceipts.map((r) => r.id)).toContain(receiptId);
  });

  it('the receipt is written with the user even when the session is never deleted', async () => {
    // The control case, and it passes either way on `sessionId` — named here
    // rather than deleted. What it adds is that the WRITE happens on the
    // ordinary path, not only on the erasure path: a column written exclusively
    // by the test's own setup is the failure P-38 documented.
    const voiceSession = await db.shadowVoiceSession.create({
      data: {
        userId: tenant.user.id,
        status: 'active',
        currentChannel: 'web',
        activeEntityId: tenant.entity.id,
      },
    });
    const confirmed = await confirmAction(tenant, voiceSession.id);
    expect(confirmed.status).toBe(200);

    const receipts = await db.shadowConsentReceipt.findMany({ where: { userId: tenant.user.id } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].sessionId).toBe(voiceSession.id);
    expect(receipts[0].entityId).toBe(tenant.entity.id);
    // All three links present at once. The column is additive to the other two,
    // not a replacement for them.
    expect(receipts[0].userId).toBe(tenant.user.id);
  });
});

// ===========================================================================
// 3. `ContactCallPreference.quietHoursTimezone` — HONOURED ON READ
// ===========================================================================
//
// Ivan's ruling: *"required, quiet hours without a timezone are meaningless"*.
//
// P-16 wired `dnc-checker` and left an honest gap in its header: the schema had
// no per-contact timezone, so a CONTACT's quiet hours were evaluated in a zone
// the CALLER supplied — in practice the user's own.
//
// THE MATCHED PAIR OF INSTANTS BELOW IS THE WHOLE TEST. One is night for the
// contact and daytime for the caller; the other is the reverse. Read in the
// contact's zone the answers are refuse / allow; read in the caller's zone they
// are allow / refuse. So the pair fails in OPPOSITE directions if the column is
// stored and not read, and neither case can pass by accident — a single instant
// could.

/** Quiet hours 21:00–08:00, stated in Asia/Tokyo (UTC+9). */
const TOKYO = 'Asia/Tokyo';
/** What the caller supplies: the operator's own zone (UTC-5, CDT in March). */
const CHICAGO = 'America/Chicago';

/** 01:00 Tokyo — inside the contact's quiet hours. 11:00 Chicago — outside. */
const NIGHT_FOR_THE_CONTACT = new Date('2026-03-11T16:00:00Z');
/** 12:00 Tokyo — outside the contact's quiet hours. 22:00 Chicago — inside. */
const NIGHT_FOR_THE_CALLER = new Date('2026-03-11T03:00:00Z');

describe("window 02 / 3 — a contact's quiet hours are computed in the CONTACT's zone", () => {
  let tenant: Tenant;
  let scope: VerifiedEntityId;
  let contactId: string;

  beforeEach(async () => {
    tenant = await createTenant({ user: { timezone: CHICAGO } });
    scope = await scopeFor(tenant);
    contactId = (await createContact(tenant.entity.id, { name: 'Tokyo Contact' })).id;
  });

  /** Set the preference through the real route — the write boundary. */
  async function setPreference(body: Record<string, unknown>): Promise<Response> {
    const { PUT } = await import('@/app/api/contacts/[id]/call-preferences/route');
    return PUT(
      requestAs(tenant, `/api/contacts/${contactId}/call-preferences`, {
        method: 'PUT',
        body,
      }),
      { params: Promise.resolve({ id: contactId }) }
    );
  }

  async function setTokyoQuietHours(): Promise<void> {
    const res = await setPreference({
      quietHoursStart: '21:00',
      quietHoursEnd: '08:00',
      quietHoursTimezone: TOKYO,
    });
    expect(res.status).toBe(200);
  }

  // =========================================================================
  // THE BAR
  // =========================================================================

  it('refuses at 01:00 in the contact\'s zone, while it is 11:00 in the caller\'s', async () => {
    await setTokyoQuietHours();

    // The column is stored by the route. Proved before the read, so a refusal
    // below cannot be a refusal for some other reason.
    await withSecondClient(async (client) => {
      const stored = await client.contactCallPreference.findUnique({ where: { contactId } });
      expect(stored?.quietHoursTimezone).toBe(TOKYO);
    });

    jest.resetModules();
    const { dncChecker } = await import('@/modules/shadow/compliance/dnc-checker');

    const result = await dncChecker.canCall(contactId, scope, {
      now: NIGHT_FOR_THE_CONTACT,
      // The caller supplies its OWN zone, exactly as P-16 designed and as
      // `call-planner` still does. The contact's zone must beat it.
      timezone: CHICAGO,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('quiet hours');
    // The refusal names the zone it was computed in, so an operator reading a
    // log can tell WHICH clock refused the call.
    expect(result.reason).toContain(TOKYO);

    // `nextAvailable` is computed in the same zone, and this is not decoration:
    // "call back in nine hours" derived from the wrong clock is wrong by the
    // same offset as the refusal it accompanies. 01:00 -> 08:00 Tokyo is seven
    // hours, which is 23:00 UTC on the same day.
    expect(result.nextAvailable?.toISOString()).toBe('2026-03-11T23:00:00.000Z');
  });

  it('allows at 12:00 in the contact\'s zone, while it is 22:00 in the caller\'s', async () => {
    // The other direction. Read in the caller's zone this is inside quiet hours
    // and would be refused, so a fix that merely swapped one hard-coded zone
    // for another fails here.
    await setTokyoQuietHours();

    jest.resetModules();
    const { dncChecker } = await import('@/modules/shadow/compliance/dnc-checker');

    const result = await dncChecker.canCall(contactId, scope, {
      now: NIGHT_FOR_THE_CALLER,
      timezone: CHICAGO,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('reaches the LIVE call-planning path, not just the checker', async () => {
    // `dnc-checker` has exactly one product caller that plans a real call:
    // `callPlannerService.planCall`, behind
    // `POST /api/shadow/voiceforge/calls/plan`. A column read only by the
    // checker would be read by a function the platform reaches through one
    // seam, so the seam is asserted too.
    await setTokyoQuietHours();

    jest.resetModules();
    const { callPlannerService } = await import('@/modules/shadow/compliance/call-planner');

    const plan = await callPlannerService.planCall({
      entityId: scope,
      contactId,
      timezone: CHICAGO,
      now: NIGHT_FOR_THE_CONTACT,
    });

    expect(plan.allowed).toBe(false);
    expect(plan.blockedReason).toContain(TOKYO);
    // Addition 3.3 asks "and if not, what instead" — the answer still comes.
    expect(plan.alternateChannel).toBe('phone');
    expect(plan.nextAvailable).toBe('2026-03-11T23:00:00.000Z');
  });

  it('round-trips the stored zone through GET, so a settings screen can show it', async () => {
    await setTokyoQuietHours();

    const { GET } = await import('@/app/api/contacts/[id]/call-preferences/route');
    const res = await GET(
      requestAs(tenant, `/api/contacts/${contactId}/call-preferences`),
      { params: Promise.resolve({ id: contactId }) }
    );
    expect(res.status).toBe(200);
    const body = await readJson<{
      data: { quietHoursTimezone: string | null; quietHoursStart: string | null };
    }>(res);
    expect(body.data.quietHoursTimezone).toBe(TOKYO);
    expect(body.data.quietHoursStart).toBe('21:00');
  });

  it('sets the zone without re-sending the hours, for a contact who moves', async () => {
    await setTokyoQuietHours();

    const moved = await setPreference({ quietHoursTimezone: 'Europe/Berlin' });
    expect(moved.status).toBe(200);

    const stored = await db.contactCallPreference.findUnique({ where: { contactId } });
    expect(stored?.quietHoursTimezone).toBe('Europe/Berlin');
    // The window itself is untouched: the hours are the contact's statement,
    // the zone is where they apply.
    expect(stored?.quietHoursStart).toBe('21:00');
    expect(stored?.quietHoursEnd).toBe('08:00');
  });

  it('refuses to store a string Intl cannot read', async () => {
    // The write boundary. A regex would accept `Europe/Atlantis`, which would
    // store fine and then be unreadable at the one moment it matters — and an
    // unreadable zone refuses every call, so the contact would go silently
    // uncallable. Caught here, where a person can fix it.
    const res = await setPreference({
      quietHoursStart: '21:00',
      quietHoursEnd: '08:00',
      quietHoursTimezone: 'Europe/Atlantis',
    });
    expect(res.status).toBe(400);

    expect(await db.contactCallPreference.findUnique({ where: { contactId } })).toBeNull();
  });

  it('refuses the call, loudly, if a zone in the database is not a zone', async () => {
    // Fail-closed, and it says which of the two things happened. Before this
    // package `localMinutes` ended in `?? 0`, which reads as MIDNIGHT — inside
    // the default quiet window — so an unparseable value would have refused
    // every call while looking like a working quiet-hours check.
    await db.contactCallPreference.create({
      data: {
        contactId,
        quietHoursStart: '21:00',
        quietHoursEnd: '08:00',
        quietHoursTimezone: 'Mars/Olympus_Mons',
      },
    });

    jest.resetModules();
    const { dncChecker } = await import('@/modules/shadow/compliance/dnc-checker');

    const result = await dncChecker.canCall(contactId, scope, {
      // Midday in every zone on Earth, so a refusal cannot be a real quiet hour.
      now: new Date('2026-03-11T12:00:00Z'),
      timezone: CHICAGO,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not a known IANA timezone');
    expect(result.reason).toContain('Mars/Olympus_Mons');
  });

  it("falls back to the caller's zone when the contact's is not recorded", async () => {
    // THE CONTROL CASE, AND IT PASSES BOTH WITH AND WITHOUT THE FIX. Named
    // rather than deleted, because a test that cannot fail is worth nothing
    // unless you know which one it is. What it asserts is that adding the
    // column did not change the answer for the rows that predate it — every
    // `ContactCallPreference` row in every existing database has
    // `quietHoursTimezone` null, and 1,079 db tests stand on that behaviour.
    const res = await setPreference({ quietHoursStart: '21:00', quietHoursEnd: '08:00' });
    expect(res.status).toBe(200);

    const stored = await db.contactCallPreference.findUnique({ where: { contactId } });
    expect(stored?.quietHoursTimezone).toBeNull();

    jest.resetModules();
    const { dncChecker } = await import('@/modules/shadow/compliance/dnc-checker');

    // 22:00 in Chicago, the caller's zone: refused, as it was before.
    const refused = await dncChecker.canCall(contactId, scope, {
      now: NIGHT_FOR_THE_CALLER,
      timezone: CHICAGO,
    });
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toContain('quiet hours');

    // 11:00 in Chicago: allowed, as it was before.
    const allowed = await dncChecker.canCall(contactId, scope, {
      now: NIGHT_FOR_THE_CONTACT,
      timezone: CHICAGO,
    });
    expect(allowed.allowed).toBe(true);
  });
});
