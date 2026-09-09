/**
 * P-10 / T-002 acceptance — the audit log, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * The audit brief said "persist the hash-chained audit log". P-00's correction
 * C3 established something worse: `logAuditEntry` had exactly four callers, all
 * four inside `src/shared/middleware/{security,compliance}.ts`, and those
 * middlewares had zero consumers. **There were no audit records in this system
 * under any code path** — not stale ones, none.
 *
 * So persisting the array was only half the work. A persisted audit log that
 * nothing calls is a table that stays empty forever, and an empty audit table is
 * worse than no audit table: "no rows" reads as "nothing happened", and an
 * auditor or an incident responder acts on that. The absent log at least
 * announces its own absence.
 *
 * The assertion that distinguishes "persisted" from "wired" is therefore not
 * "the service can write a row" — a unit test with a mocked Prisma proves that
 * and proves nothing else. It is:
 *
 *     drive a REAL ROUTE with a REAL SESSION, then read the row back out of
 *     Postgres and check it says what actually happened.
 *
 * That is `writes a row for an ordinary request` below, and everything after it
 * is about the properties that make the row worth having: the actor cannot be
 * chosen by the party being audited, refusals are recorded, a refused request is
 * not filed under the tenant it merely named, and the chain survives concurrency.
 *
 * `getToken` is UNMOCKED here. Each request carries a genuine NextAuth JWE and
 * the production decrypt path runs.
 */

import { GET as accessLogGET } from '@/app/api/security/access-log/route';
import { GET as verifyGET } from '@/app/api/security/audit-log/verify/route';
import { GET as dmsGET, POST as dmsPOST } from '@/app/api/crisis/dead-man-switch/route';
import { POST as checkInPOST } from '@/app/api/crisis/dead-man-switch/check-in/route';
import { POST as evaluatePOST } from '@/app/api/crisis/dead-man-switch/evaluate/route';
import { GET as ssoGET } from '@/app/api/admin/sso/route';
import { auditService } from '@/modules/security/services/audit-service';
import { UNRESOLVED_ENTITY } from '@/modules/security/audit-wiring';
import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

const WHOLE_TIME = { from: new Date(0), to: new Date('2999-01-01') };

async function rowsFor(entityId: string) {
  return db.auditLogEntry.findMany({
    where: { entityId },
    orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
  });
}

describe('T-002 — the audit log is written by real requests', () => {
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeEach(async () => {
    ({ tenantA, tenantB } = await createTwoTenants());
  });

  // -------------------------------------------------------------------------
  // THE CENTRAL ASSERTION
  // -------------------------------------------------------------------------

  it('writes a row for an ordinary request, and the row can be read back', async () => {
    // Before this package this table was empty under every code path.
    expect(await db.auditLogEntry.count()).toBe(0);

    const res = await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    // The dead man switch is not configured for this user, so the route answers
    // 500 with "not configured". That is deliberate here: the audit row must
    // exist regardless of the outcome, and a request that FAILED is exactly the
    // kind a reader needs to find later.
    expect([200, 500]).toContain(res.status);

    const rows = await db.auditLogEntry.findMany();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.actor).toBe(tenantA.user.email);
    expect(row.actorId).toBe(tenantA.user.id);
    expect(row.requestMethod).toBe('GET');
    expect(row.requestPath).toBe('/api/crisis/dead-man-switch');
    expect(row.resource).toBe('crisis.dead-man-switch');
    expect(row.statusCode).toBe(res.status);
    expect(row.sensitivityLevel).toBe('RESTRICTED');
    expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.previousHash).toBe('0');
  });

  it('writes one row per request, chained', async () => {
    await dmsPOST(
      requestAs(tenantA, '/api/crisis/dead-man-switch', {
        method: 'POST',
        body: { isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] },
      })
    );
    await checkInPOST(
      requestAs(tenantA, '/api/crisis/dead-man-switch/check-in', { method: 'POST' })
    );
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    const rows = await rowsFor(tenantA.entity.id);
    expect(rows).toHaveLength(3);

    expect(rows[0].previousHash).toBe('0');
    expect(rows[1].previousHash).toBe(rows[0].hash);
    expect(rows[2].previousHash).toBe(rows[1].hash);
  });

  it('survives a "restart" — the rows are in Postgres, not in a process array', async () => {
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    // A fresh service instance holds no state of its own. Against the old
    // implementation (`private readonly entries: AuditLogEntry[]`) this returned
    // zero, which is the whole defect in one assertion.
    const { AuditService } = await import('@/modules/security/services/audit-service');
    const fresh = new AuditService();

    const { total } = await fresh.getAuditLog({ entityId: tenantA.entity.id });
    expect(total).toBe(1);
  });

  // -------------------------------------------------------------------------
  // THE ACTOR
  // -------------------------------------------------------------------------

  it('takes the actor from the verified session, not from a header', async () => {
    // Before P-00, three sites read the audit actor from `x-user-id`. The party
    // being audited chose the name on the tamper-evident record, which made the
    // hash chain real cryptography over a forgeable input.
    await dmsGET(
      requestAs(tenantA, '/api/crisis/dead-man-switch', {
        headers: {
          'x-user-id': 'attacker-chosen',
          'x-entity-id': tenantB.entity.id,
        },
      })
    );

    const rows = await db.auditLogEntry.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe(tenantA.user.email);
    expect(rows[0].actorId).toBe(tenantA.user.id);
    expect(rows[0].actor).not.toBe('attacker-chosen');
    expect(rows[0].entityId).toBe(tenantA.entity.id);
  });

  it('records an anonymous request as anonymous, and files it under no tenant', async () => {
    const res = await dmsGET(anonymousRequest('/api/crisis/dead-man-switch'));
    expect(res.status).toBe(401);

    const rows = await db.auditLogEntry.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe('anonymous');
    expect(rows[0].actorId).toBeNull();
    expect(rows[0].statusCode).toBe(401);
    expect(rows[0].entityId).toBe(UNRESOLVED_ENTITY);
  });

  // -------------------------------------------------------------------------
  // REFUSALS
  // -------------------------------------------------------------------------

  it('records a cross-tenant refusal — the most valuable line in the log', async () => {
    const res = await ssoGET(
      requestAs(tenantA, `/api/admin/sso?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);

    const rows = await db.auditLogEntry.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].statusCode).toBe(403);
    expect(rows[0].actorId).toBe(tenantA.user.id);
    expect(rows[0].resource).toBe('admin.sso');
  });

  it('does NOT file a refused request under the tenant it asked for', async () => {
    // Writing the attempted id into `entityId` would let an attacker inject rows
    // into another tenant's hash chain by naming it -- turning the audit log
    // into a write primitive against the tenant it is meant to protect.
    await ssoGET(requestAs(tenantA, `/api/admin/sso?entityId=${tenantB.entity.id}`));

    expect(await rowsFor(tenantB.entity.id)).toHaveLength(0);

    const rows = await db.auditLogEntry.findMany();
    expect(rows[0].entityId).toBe(UNRESOLVED_ENTITY);
    // The attempt itself is not lost -- it is recorded as an attempt.
    expect((rows[0].details as Record<string, unknown>).attemptedEntityId).toBe(
      tenantB.entity.id
    );
  });

  // -------------------------------------------------------------------------
  // THE CHAIN
  // -------------------------------------------------------------------------

  it('chains per entity, so two tenants interleaving does not break either chain', async () => {
    // The in-memory version kept ONE global chain and then verified per entity,
    // so `verifyAuditChain` reported `valid: false` for both tenants as soon as
    // their writes interleaved -- i.e. in every real deployment. Nothing caught
    // it because no test ever wrote two entities' entries alternately.
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantB, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantB, '/api/crisis/dead-man-switch'));

    expect(await auditService.verifyAuditChain(tenantA.entity.id, WHOLE_TIME)).toMatchObject({
      valid: true,
      checkedEntries: 2,
    });
    expect(await auditService.verifyAuditChain(tenantB.entity.id, WHOLE_TIME)).toMatchObject({
      valid: true,
      checkedEntries: 2,
    });
  });

  it('detects a tampered row', async () => {
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    const rows = await rowsFor(tenantA.entity.id);

    // Edit the STORED row, the way someone with database access would. The old
    // unit tests "tampered" by mutating the object the service had returned,
    // which only worked because it was the same array element.
    await db.auditLogEntry.update({
      where: { id: rows[1].id },
      data: { details: { tampered: true } },
    });

    const result = await auditService.verifyAuditChain(tenantA.entity.id, WHOLE_TIME);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(rows[1].id);
  });

  it('detects a DELETED row — the obvious way to hide an action', async () => {
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    const rows = await rowsFor(tenantA.entity.id);
    await db.auditLogEntry.delete({ where: { id: rows[1].id } });

    // The survivor's previousHash points at a hash no remaining row carries.
    const result = await auditService.verifyAuditChain(tenantA.entity.id, WHOLE_TIME);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(rows[2].id);
  });

  it('does not fork the chain under concurrent writes for one entity', async () => {
    // Without the advisory lock in `logAuditEntry`, two concurrent requests read
    // the same tail and both write `previousHash = X`. A forked chain verifies
    // as BROKEN, so ordinary concurrency would be indistinguishable from
    // tampering -- and it would show up first on a fast CI box, not locally.
    await Promise.all([
      dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch')),
      dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch')),
      dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch')),
      dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch')),
      dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch')),
    ]);

    const rows = await rowsFor(tenantA.entity.id);
    expect(rows).toHaveLength(5);

    const previousHashes = rows.map((r) => r.previousHash);
    expect(new Set(previousHashes).size).toBe(5);

    expect(await auditService.verifyAuditChain(tenantA.entity.id, WHOLE_TIME)).toMatchObject({
      valid: true,
      checkedEntries: 5,
    });
  });

  // -------------------------------------------------------------------------
  // READING IT BACK THROUGH A ROUTE
  // -------------------------------------------------------------------------

  it('serves the written rows back through /api/security/access-log', async () => {
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    const res = await accessLogGET(requestAs(tenantA, '/api/security/access-log'));
    expect(res.status).toBe(200);

    const body = await readJson<{ data: { entries: Array<Record<string, unknown>>; total: number } }>(res);
    // ONE entry, not two: the wrapper records a request AFTER the handler has
    // produced a response, because the row has to carry the real status code.
    // So a read of the log never contains the read itself.
    expect(body.data.total).toBe(1);
    expect(body.data.entries[0].user).toBe(tenantA.user.email);
    expect(body.data.entries[0].resource).toBe('crisis.dead-man-switch');
    expect(body.data.entries[0].hash).toMatch(/^[0-9a-f]{64}$/);

    // ...and the read itself lands a moment later.
    expect(
      await db.auditLogEntry.count({ where: { resource: 'security.access-log' } })
    ).toBe(1);
  });

  it('never shows one tenant another tenant rows through the access log', async () => {
    // B does something; A does something. Both rows exist in one table.
    await dmsGET(requestAs(tenantB, '/api/crisis/dead-man-switch'));
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));
    expect(await db.auditLogEntry.count()).toBe(2);

    // An ORDINARY request by A -- not an attempt to name B's entity. A list
    // route that leaks rows is a different failure from a single-record 403,
    // and an empty result would pass this vacuously, so A has a row of its own.
    const res = await accessLogGET(requestAs(tenantA, '/api/security/access-log'));
    const body = await readJson<{
      data: { entries: Array<{ resource: string; user: string }>; total: number };
    }>(res);

    expect(body.data.total).toBe(1);
    expect(body.data.entries[0].user).toBe(tenantA.user.email);
    for (const entry of body.data.entries) {
      expect(entry.user).not.toBe(tenantB.user.email);
    }
  });

  it('refuses to read another tenant audit log even when named explicitly', async () => {
    await dmsGET(requestAs(tenantB, '/api/crisis/dead-man-switch'));

    const res = await accessLogGET(
      requestAs(tenantA, `/api/security/access-log?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('answers 401 to an anonymous access-log request', async () => {
    const res = await accessLogGET(anonymousRequest('/api/security/access-log'));
    expect(res.status).toBe(401);
  });

  it('exposes the chain verifier over HTTP, scoped to the caller', async () => {
    await dmsGET(requestAs(tenantA, '/api/crisis/dead-man-switch'));

    const res = await verifyGET(requestAs(tenantA, '/api/security/audit-log/verify'));
    expect(res.status).toBe(200);

    const body = await readJson<{ data: { valid: boolean; checkedEntries: number } }>(res);
    expect(body.data.valid).toBe(true);
    expect(body.data.checkedEntries).toBeGreaterThan(0);

    const foreign = await verifyGET(
      requestAs(tenantA, `/api/security/audit-log/verify?entityId=${tenantB.entity.id}`)
    );
    expect(foreign.status).toBe(403);
  });
});

describe('T-015 — the kill switch is persisted and has a consumer', () => {
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeEach(async () => {
    ({ tenantA, tenantB } = await createTwoTenants());
  });

  async function arm(tenant: Tenant, hoursAgo: number) {
    await dmsPOST(
      requestAs(tenant, '/api/crisis/dead-man-switch', {
        method: 'POST',
        body: {
          isEnabled: true,
          checkInIntervalHours: 1,
          triggerAfterMisses: 2,
          protocols: [
            { order: 1, action: 'NOTIFY', contactName: 'Now', message: 'go', delayHoursAfterTrigger: 0 },
          ],
        },
      })
    );
    await db.deadManSwitch.update({
      where: { userId: tenant.user.id },
      data: { lastCheckIn: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) },
    });
  }

  it('persists the switch to DeadManSwitch, so a restart does not disarm it', async () => {
    const res = await dmsPOST(
      requestAs(tenantA, '/api/crisis/dead-man-switch', {
        method: 'POST',
        body: { isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] },
      })
    );
    expect(res.status).toBe(201);

    const row = await db.deadManSwitch.findUnique({ where: { userId: tenantA.user.id } });
    expect(row).not.toBeNull();
    expect(row!.isEnabled).toBe(true);
    expect(row!.checkInIntervalHours).toBe(24);
  });

  it('the switch belongs to the session user and cannot be named by a caller', async () => {
    await dmsPOST(
      requestAs(tenantA, '/api/crisis/dead-man-switch', {
        method: 'POST',
        // A body naming another user changes nothing: the route uses
        // session.userId and the schema has no userId field.
        body: {
          userId: tenantB.user.id,
          isEnabled: true,
          checkInIntervalHours: 24,
          triggerAfterMisses: 3,
          protocols: [],
        },
      })
    );

    expect(await db.deadManSwitch.findUnique({ where: { userId: tenantA.user.id } })).not.toBeNull();
    expect(await db.deadManSwitch.findUnique({ where: { userId: tenantB.user.id } })).toBeNull();
  });

  it('FIRES: a tripped switch executes protocols and leaves a durable record', async () => {
    await arm(tenantA, 3);

    const res = await evaluatePOST(
      requestAs(tenantA, '/api/crisis/dead-man-switch/evaluate', { method: 'POST' })
    );
    expect(res.status).toBe(200);

    const body = await readJson<{ data: { triggered: boolean; executed: unknown[] } }>(res);
    expect(body.data.triggered).toBe(true);
    expect(body.data.executed).toHaveLength(1);

    // The consequence is observable after the fact -- which is the whole point
    // of wiring a consumer to a boolean nobody was reading.
    const fired = await db.auditLogEntry.findMany({
      where: { resource: 'crisis.dead-man-switch', action: 'DEAD_MAN_SWITCH_FIRED' },
    });
    expect(fired).toHaveLength(1);
    expect(fired[0].resourceId).toBe(tenantA.user.id);
    expect(fired[0].sensitivityLevel).toBe('RESTRICTED');
  });

  it('does not fire twice for one outage', async () => {
    await arm(tenantA, 3);

    await evaluatePOST(requestAs(tenantA, '/api/crisis/dead-man-switch/evaluate', { method: 'POST' }));
    const second = await evaluatePOST(
      requestAs(tenantA, '/api/crisis/dead-man-switch/evaluate', { method: 'POST' })
    );

    const body = await readJson<{ data: { alreadyFired: boolean; executed: unknown[] } }>(second);
    expect(body.data.alreadyFired).toBe(true);
    expect(body.data.executed).toHaveLength(0);

    const fired = await db.auditLogEntry.findMany({
      where: { action: 'DEAD_MAN_SWITCH_FIRED' },
    });
    expect(fired).toHaveLength(1);
  });

  it('refuses an anonymous evaluation', async () => {
    const res = await evaluatePOST(
      anonymousRequest('/api/crisis/dead-man-switch/evaluate', { method: 'POST' })
    );
    expect(res.status).toBe(401);
  });

  it('refuses to file the firing under another tenant entity', async () => {
    await arm(tenantA, 3);

    const res = await evaluatePOST(
      requestAs(tenantA, `/api/crisis/dead-man-switch/evaluate?entityId=${tenantB.entity.id}`, {
        method: 'POST',
      })
    );
    expect(res.status).toBe(403);

    expect(
      await db.auditLogEntry.count({ where: { action: 'DEAD_MAN_SWITCH_FIRED' } })
    ).toBe(0);
  });
});
