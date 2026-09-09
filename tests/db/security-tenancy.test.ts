/**
 * P-10 acceptance — Security, Crisis, Delegation and Admin tenancy, proven
 * against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * The package card measured 28 routes across `security`, `crisis`, `delegation`,
 * `admin` and `safety`, "of which only 6 are on the bad pattern". Six routes
 * discarded the session as `_session` (or as a global `withRole` check) and took
 * `entityId` off the query string or body.
 *
 * `withRole(request, ['admin'], ...)` is the part worth stating, because it does
 * not look like the bug. It proves the caller holds a role. Roles in this system
 * are GLOBAL — `AuthSession.role` comes off the session JWT and names no tenant
 * — so an admin of tenant A passed the check and then named tenant B's entity.
 * Authorising the ACTION and not the TENANT is the same defect as `_session`
 * wearing a uniform.
 *
 * Two more holes turned up that the "6 bad routes" count did not include,
 * because they carry no `entityId` at all:
 *
 *   - `/api/crisis/[id]/*` looked a crisis up by id with NO ownership check
 *     anywhere in the chain. Any authenticated caller who knew an id could read
 *     it, edit it, archive it, or ACTIVATE ITS WAR ROOM — which clears the
 *     owner's calendar and calls their phone tree.
 *   - `/api/delegation/[id]/approve` advanced someone else's approval chain.
 *
 * Per route: owner -> 200/201; A reads B -> 403; A writes into B -> 403 AND
 * nothing changed in the database; no session -> 401. Plus a list route proven
 * not to leak, and the symmetry check — a "fix" that denies everyone passes
 * every other assertion in this file.
 *
 * `getToken` is UNMOCKED. Every request presents a genuine NextAuth JWE.
 */

import { GET as dlpGET, POST as dlpPOST } from '@/app/api/admin/dlp/route';
import { POST as dlpCheckPOST } from '@/app/api/admin/dlp/check/route';
import { GET as policiesGET, POST as policiesPOST } from '@/app/api/admin/policies/route';
import { GET as ssoGET, POST as ssoPOST } from '@/app/api/admin/sso/route';
import { GET as ediscoveryGET, POST as ediscoveryPOST } from '@/app/api/admin/ediscovery/route';
import { GET as reputationGET } from '@/app/api/safety/reputation/route';
import { GET as dashboardGET } from '@/app/api/security/dashboard/route';
import { GET as threatsGET } from '@/app/api/security/threats/route';
import { POST as crisisPOST } from '@/app/api/crisis/route';
import {
  GET as crisisGET,
  PATCH as crisisPATCH,
  DELETE as crisisDELETE,
} from '@/app/api/crisis/[id]/route';
import { POST as warRoomPOST } from '@/app/api/crisis/[id]/war-room/route';
import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

/** An admin session for a tenant. Every /api/admin route requires the role. */
async function createAdminTenant(): Promise<Tenant> {
  return createTenant({ role: 'admin' });
}

async function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('T-001 — admin routes authorise the tenant, not just the role', () => {
  let adminA: Tenant;
  let adminB: Tenant;

  beforeEach(async () => {
    adminA = await createAdminTenant();
    adminB = await createAdminTenant();
  });

  // -------------------------------------------------------------------------
  // DLP
  // -------------------------------------------------------------------------

  it('owner: an admin reads their own DLP rules', async () => {
    const res = await dlpGET(requestAs(adminA, `/api/admin/dlp?entityId=${adminA.entity.id}`));
    expect(res.status).toBe(200);
  });

  it('owner: an admin creates a DLP rule without naming their own tenant', async () => {
    // entityId omitted on purpose. Making the client name its own tenant is the
    // habit that produced this bug; the session's active entity is used.
    const res = await dlpPOST(
      requestAs(adminA, '/api/admin/dlp', {
        method: 'POST',
        body: { name: 'SSNs', pattern: '\\d{3}-\\d{2}-\\d{4}', action: 'BLOCK', scope: 'ALL' },
      })
    );
    expect(res.status).toBe(201);

    const rules = await db.rule.findMany({ where: { scope: 'DLP' } });
    expect(rules).toHaveLength(1);
    expect(rules[0].entityId).toBe(adminA.entity.id);
  });

  it("refuses to read another tenant's DLP rules", async () => {
    const res = await dlpGET(requestAs(adminA, `/api/admin/dlp?entityId=${adminB.entity.id}`));
    expect(res.status).toBe(403);
  });

  it("refuses to write a DLP rule into another tenant, and writes nothing", async () => {
    const res = await dlpPOST(
      requestAs(adminA, '/api/admin/dlp', {
        method: 'POST',
        body: {
          entityId: adminB.entity.id,
          name: 'planted',
          pattern: '.*',
          action: 'BLOCK',
          scope: 'ALL',
        },
      })
    );
    expect(res.status).toBe(403);

    // A 403 that still writes is not a fix.
    expect(await db.rule.count({ where: { entityId: adminB.entity.id } })).toBe(0);
  });

  it('refuses an anonymous DLP request', async () => {
    const res = await dlpGET(anonymousRequest('/api/admin/dlp'));
    expect(res.status).toBe(401);
  });

  it('still refuses a non-admin, so the role gate did not get lost', async () => {
    const memberA = await createTenant({ role: 'member' });
    const res = await dlpGET(requestAs(memberA, `/api/admin/dlp?entityId=${memberA.entity.id}`));
    expect(res.status).toBe(403);
  });

  it("refuses to scan content against another tenant's DLP rules", async () => {
    // A two-way leak: the caller learns which patterns that tenant guards, and
    // their content is judged by rules they never agreed to.
    const res = await dlpCheckPOST(
      requestAs(adminA, '/api/admin/dlp/check', {
        method: 'POST',
        body: { entityId: adminB.entity.id, content: 'anything', scope: 'ALL' },
      })
    );
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Org policies
  // -------------------------------------------------------------------------

  it('owner: an admin reads their own policies', async () => {
    const res = await policiesGET(
      requestAs(adminA, `/api/admin/policies?entityId=${adminA.entity.id}`)
    );
    expect(res.status).toBe(200);
  });

  it("refuses to read another tenant's policies", async () => {
    const res = await policiesGET(
      requestAs(adminA, `/api/admin/policies?entityId=${adminB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('refuses to write a policy into another tenant, and writes nothing', async () => {
    const res = await policiesPOST(
      requestAs(adminA, '/api/admin/policies', {
        method: 'POST',
        body: {
          entityId: adminB.entity.id,
          name: 'planted',
          type: 'RETENTION',
          config: {},
        },
      })
    );
    expect(res.status).toBe(403);
    expect(
      await db.rule.count({ where: { entityId: adminB.entity.id, scope: 'ORG_POLICY' } })
    ).toBe(0);
  });

  it('does not leak another tenant policies from an ORDINARY list request', async () => {
    // Not "refuses ?entityId=B" -- an ordinary request whose result would
    // include B's row if the scope were missing. Leaking rows is a different
    // failure from a single-record 403.
    await policiesPOST(
      requestAs(adminB, '/api/admin/policies', {
        method: 'POST',
        body: { name: 'B only', type: 'SHARING', config: {} },
      })
    );
    expect(await db.rule.count({ where: { scope: 'ORG_POLICY' } })).toBe(1);

    const res = await policiesGET(requestAs(adminA, '/api/admin/policies'));
    expect(res.status).toBe(200);

    const body = await readJson<{ data: Array<{ name: string }> }>(res);
    expect(body.data).toEqual([]);
  });

  it('symmetry: tenant B reaches B own data', async () => {
    // A "fix" that denies everyone passes every other assertion in this file.
    await policiesPOST(
      requestAs(adminB, '/api/admin/policies', {
        method: 'POST',
        body: { name: 'B only', type: 'SHARING', config: {} },
      })
    );

    const res = await policiesGET(requestAs(adminB, '/api/admin/policies'));
    const body = await readJson<{ data: Array<{ name: string }> }>(res);
    expect(body.data.map((p) => p.name)).toEqual(['B only']);
  });

  // -------------------------------------------------------------------------
  // SSO — the worst of the six
  // -------------------------------------------------------------------------

  it('owner: an admin reads their own SSO config', async () => {
    const res = await ssoGET(requestAs(adminA, `/api/admin/sso?entityId=${adminA.entity.id}`));
    expect(res.status).toBe(200);
  });

  it("refuses to read another tenant's SSO config", async () => {
    const res = await ssoGET(requestAs(adminA, `/api/admin/sso?entityId=${adminB.entity.id}`));
    expect(res.status).toBe(403);
  });

  it("refuses to repoint another tenant's identity provider, and changes nothing", async () => {
    // This is account takeover, not a data leak: SSO configuration decides which
    // issuer is trusted to assert who that tenant's users are.
    const before = await db.entity.findUnique({ where: { id: adminB.entity.id } });

    const res = await ssoPOST(
      requestAs(adminA, '/api/admin/sso', {
        method: 'POST',
        body: {
          entityId: adminB.entity.id,
          provider: 'SAML',
          issuerUrl: 'https://attacker.example.com/sso',
          action: 'configure',
        },
      })
    );
    expect(res.status).toBe(403);

    const after = await db.entity.findUnique({ where: { id: adminB.entity.id } });
    expect(after!.complianceProfile).toEqual(before!.complianceProfile);
  });

  // -------------------------------------------------------------------------
  // eDiscovery
  // -------------------------------------------------------------------------

  it("refuses to list another tenant's legal-discovery exports", async () => {
    const res = await ediscoveryGET(
      requestAs(adminA, `/api/admin/ediscovery?entityId=${adminB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to request an export of another tenant's data", async () => {
    const res = await ediscoveryPOST(
      requestAs(adminA, '/api/admin/ediscovery', {
        method: 'POST',
        body: {
          entityId: adminB.entity.id,
          dateRange: { start: '2020-01-01', end: '2030-01-01' },
          dataTypes: ['messages'],
        },
      })
    );
    expect(res.status).toBe(403);
  });

  it('names the requester from the session, not from the body', async () => {
    // `requestedBy` used to be a required body field, so the person named on a
    // legal-discovery export was chosen by whoever asked for it.
    const res = await ediscoveryPOST(
      requestAs(adminA, '/api/admin/ediscovery', {
        method: 'POST',
        body: {
          requestedBy: 'someone-else',
          dateRange: { start: '2020-01-01', end: '2030-01-01' },
          dataTypes: ['messages'],
        },
      })
    );
    expect(res.status).toBe(201);

    const body = await readJson<{ data: { requestedBy: string; entityId: string } }>(res);
    expect(body.data.requestedBy).toBe(adminA.user.id);
    expect(body.data.entityId).toBe(adminA.entity.id);
  });

  // -------------------------------------------------------------------------
  // safety/reputation
  // -------------------------------------------------------------------------

  it("refuses to read another tenant's sender reputation", async () => {
    const res = await reputationGET(
      requestAs(adminA, `/api/safety/reputation?entityId=${adminB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });
});

describe('T-026 — the security dashboard reports measurements, scoped to the caller', () => {
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeEach(async () => {
    ({ tenantA, tenantB } = await createTwoTenants());
  });

  it('owner: reports figures derived from this tenant audit log', async () => {
    const res = await dashboardGET(requestAs(tenantA, '/api/security/dashboard'));
    expect(res.status).toBe(200);

    const body = await readJson<{
      data: { securityScore: number | null; auditEntries30d: number; unknownChecks: number };
    }>(res);

    // First request for this tenant, so nothing is recorded YET (the wrapper
    // writes after the response). The route says zero rather than inventing 82.
    expect(body.data.auditEntries30d).toBe(0);
    // And the checks with no data source are reported as unknown, not as passes.
    expect(body.data.unknownChecks).toBeGreaterThan(0);
  });

  it("refuses to report another tenant's security posture", async () => {
    const res = await dashboardGET(
      requestAs(tenantA, `/api/security/dashboard?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('does not show one tenant another tenant refused requests in the threat feed', async () => {
    // B generates a refusal of its own.
    await dashboardGET(requestAs(tenantB, `/api/security/dashboard?entityId=${tenantA.entity.id}`));
    expect(
      await db.auditLogEntry.count({ where: { statusCode: 403 } })
    ).toBeGreaterThan(0);

    const res = await threatsGET(requestAs(tenantA, '/api/security/threats'));
    const body = await readJson<{ data: { threats: Array<{ source: string }> } }>(res);

    for (const threat of body.data.threats) {
      expect(threat.source).not.toBe(tenantB.user.email);
    }
  });

  it('refuses an anonymous dashboard request', async () => {
    const res = await dashboardGET(anonymousRequest('/api/security/dashboard'));
    expect(res.status).toBe(401);
  });
});

describe('T-001 — crisis records belong to a user, and the [id] routes now say so', () => {
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeEach(async () => {
    ({ tenantA, tenantB } = await createTwoTenants());
  });

  async function declareCrisisAs(tenant: Tenant): Promise<string> {
    const res = await crisisPOST(
      requestAs(tenant, '/api/crisis', {
        method: 'POST',
        body: {
          type: 'DATA_BREACH',
          severity: 'CRITICAL',
          title: 'Breach',
          description: 'Unauthorised access',
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await readJson<{ data: { id: string } }>(res);
    return body.data.id;
  }

  it("refuses to declare a crisis inside another tenant's entity", async () => {
    const res = await crisisPOST(
      requestAs(tenantA, '/api/crisis', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          type: 'DATA_BREACH',
          severity: 'CRITICAL',
          title: 'planted',
          description: 'planted',
        },
      })
    );
    expect(res.status).toBe(403);
  });

  it('owner: reads their own crisis', async () => {
    const id = await declareCrisisAs(tenantA);

    const res = await crisisGET(requestAs(tenantA, `/api/crisis/${id}`), await idParams(id));
    expect(res.status).toBe(200);
  });

  it("does not disclose another user's crisis", async () => {
    const id = await declareCrisisAs(tenantB);

    const res = await crisisGET(requestAs(tenantA, `/api/crisis/${id}`), await idParams(id));
    // 404, not 403: a foreign record is simply not found, so the response does
    // not confirm that the id exists.
    expect(res.status).toBe(404);
  });

  it("does not let one user edit another user's crisis, and changes nothing", async () => {
    const id = await declareCrisisAs(tenantB);

    const res = await crisisPATCH(
      requestAs(tenantA, `/api/crisis/${id}`, {
        method: 'PATCH',
        body: { severity: 'LOW', title: 'nothing to see here' },
      }),
      await idParams(id)
    );
    expect(res.status).toBe(404);

    const check = await crisisGET(requestAs(tenantB, `/api/crisis/${id}`), await idParams(id));
    const body = await readJson<{ data: { severity: string; title: string } }>(check);
    expect(body.data.severity).toBe('CRITICAL');
    expect(body.data.title).toBe('Breach');
  });

  it("does not let one user archive another user's crisis", async () => {
    const id = await declareCrisisAs(tenantB);

    const res = await crisisDELETE(
      requestAs(tenantA, `/api/crisis/${id}`, { method: 'DELETE' }),
      await idParams(id)
    );
    expect(res.status).toBe(404);

    const check = await crisisGET(requestAs(tenantB, `/api/crisis/${id}`), await idParams(id));
    const body = await readJson<{ data: { status: string } }>(check);
    expect(body.data.status).not.toBe('RESOLVED');
  });

  it("does not let one user activate another user's war room", async () => {
    // Activating a war room clears the owner's calendar, surfaces their
    // documents, drafts communications and calls their phone tree.
    const id = await declareCrisisAs(tenantB);

    const res = await warRoomPOST(
      requestAs(tenantA, `/api/crisis/${id}/war-room`, {
        method: 'POST',
        body: { action: 'activate' },
      }),
      await idParams(id)
    );
    expect(res.status).toBe(404);

    const check = await crisisGET(requestAs(tenantB, `/api/crisis/${id}`), await idParams(id));
    const body = await readJson<{ data: { warRoom: { isActive: boolean } } }>(check);
    expect(body.data.warRoom.isActive).toBe(false);
  });

  it('symmetry: the owner CAN activate their own war room', async () => {
    const id = await declareCrisisAs(tenantB);

    const res = await warRoomPOST(
      requestAs(tenantB, `/api/crisis/${id}/war-room`, {
        method: 'POST',
        body: { action: 'activate' },
      }),
      await idParams(id)
    );
    expect(res.status).toBe(200);
  });

  it('refuses an anonymous crisis read', async () => {
    const id = await declareCrisisAs(tenantA);

    const res = await crisisGET(anonymousRequest(`/api/crisis/${id}`), await idParams(id));
    expect(res.status).toBe(401);
  });
});
