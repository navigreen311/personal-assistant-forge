/**
 * P-09 / T-034 — the execution gate cannot be bypassed.
 *
 * ============================================================================
 * WHY THIS FILE IS THE ONE THAT MATTERS
 * ============================================================================
 *
 * The execution gate is the mechanism that STOPS an action. Everything else in
 * the control plane is arranged around it: the queue holds actions until they
 * are approved, the gate decides whether an approved action may actually run,
 * the rollback plan is the promise made if it does.
 *
 * A gate that is bypassable is WORSE than no gate at all. With no gate, an
 * operator knows nothing is stopping the action and behaves accordingly. With a
 * bypassable gate, the console says the action is protected, the consent
 * receipt says a rule was evaluated, and the audit trail agrees -- and none of
 * it is true. The system does not merely fail to protect; it reports protection
 * it is not providing, which is what people then rely on.
 *
 * Before P-09 the gate rules lived in `new Map<string, ExecutionGate>()` at
 * module scope in `execution-gate.ts`. The deployment target is a single Docker
 * instance with `restart: unless-stopped`, so restarts are guaranteed. Every
 * restart emptied that Map. The gates page kept listing gates -- because it
 * listed whatever was in the Map of the process answering the request -- and
 * `evaluateGates` returned `{ passed: true }` for everything, because a Map with
 * nothing in it blocks nothing. There was no error, no log line, and no way to
 * tell the difference from the outside.
 *
 * So this file asserts the two ways a gate can be bypassed:
 *
 *   1. RESTART. Register a gate, then drop every module-level object the
 *      process was holding -- `jest.resetModules()` is precisely a restart from
 *      the point of view of module state -- and re-import the service fresh.
 *      The gate must still block. It also reads the rule back through a SECOND
 *      PrismaClient, which is a different process's view of the same row: if
 *      the state were still in a Map, that client would see nothing.
 *
 *   2. A DIRECT SERVICE CALL. Route handlers are not the only caller: the queue
 *      worker, the runbook engine and any future job call `executeAction`
 *      directly. A gate enforced in the route layer would be no gate at all.
 *      The assertion goes straight at the service, with no request in play.
 *
 * And the two ways a gate can be REMOVED by someone who should not be able to:
 * another tenant deleting it, or another tenant switching it inactive. Both are
 * bypasses with an extra step.
 */

import { PrismaClient } from '@prisma/client';

import { verifyEntityForUser } from '@/shared/middleware/auth';
import {
  POST as gatesPOST,
  PUT as gatesPUT,
  DELETE as gatesDELETE,
} from '@/app/api/execution/gates/route';
import { PATCH as queueItemPATCH } from '@/app/api/execution/queue/[id]/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

/** A gate that refuses everything, registered through the public API. */
async function registerBlockingGate(tenant: Tenant): Promise<string> {
  const res = await gatesPOST(
    requestAs(tenant, '/api/execution/gates', {
      method: 'POST',
      body: {
        name: 'Halt',
        // Deliberately absolute: the point is whether the gate is CONSULTED,
        // not whether the expression parser is clever.
        expression: 'false',
        description: 'Nothing may execute',
        scope: 'ENTITY',
        isActive: true,
      },
    })
  );
  expect(res.status).toBe(201);
  const body = await readJson<{ success: true; data: { id: string } }>(res);
  return body.data.id;
}

/** An APPROVED action, ready to execute, owned by `tenant`. */
async function approvedAction(tenant: Tenant): Promise<string> {
  const log = await db.actionLog.create({
    data: {
      actor: 'AI',
      actionType: 'DELETE_RECORD',
      target: 'contacts/c-1',
      reason: 'fixture',
      blastRadius: 'HIGH',
      reversible: false,
      status: 'PENDING',
    },
  });

  const action = await db.queuedAction.create({
    data: {
      actionLogId: log.id,
      actor: 'AI',
      actionType: 'DELETE_RECORD',
      target: 'contacts/c-1',
      description: 'Delete a contact',
      reason: 'fixture',
      impact: 'irreversible',
      rollbackPlan: 'recreate from snapshot',
      blastRadius: 'HIGH',
      reversible: false,
      status: 'APPROVED',
      requiresApproval: true,
      entityId: tenant.entity.id,
    },
  });

  return action.id;
}

describe('T-034 — the execution gate resists a process restart', () => {
  it('keeps its rules in Postgres, where a second process can see them', async () => {
    const gateId = await registerBlockingGate(tenantA);

    // A second client is a different process's view of the same row. If the
    // gate still lived in a module-level Map, there would be nothing here.
    const other = new PrismaClient();
    try {
      const row = await other.executionGateRule.findUnique({ where: { id: gateId } });
      expect(row).not.toBeNull();
      expect(row!.expression).toBe('false');
      expect(row!.isActive).toBe(true);
      expect(row!.entityId).toBe(tenantA.entity.id);
    } finally {
      await other.$disconnect();
    }
  });

  it('still blocks after every module-level object in the process is dropped', async () => {
    await registerBlockingGate(tenantA);
    const actionId = await approvedAction(tenantA);

    // A restart, expressed exactly: the process forgets every module it had
    // loaded and loads them again from scratch. Anything that was only in
    // memory is gone. Anything in Postgres is not.
    jest.resetModules();

    const freshQueue = await import('@/modules/execution/services/action-queue');
    const freshAuth = await import('@/shared/middleware/auth');

    const scope = await freshAuth.verifyEntityForUser(
      tenantA.entity.id,
      tenantA.user.id
    );
    expect(scope).not.toBeNull();

    await expect(freshQueue.executeAction(actionId, scope!)).rejects.toThrow(
      /Execution blocked by gate "Halt"/
    );

    // And the refusal is durable, not just thrown: the action is FAILED, it was
    // never marked EXECUTED, and no consent receipt was minted for work that
    // did not happen.
    const after = await db.queuedAction.findUnique({ where: { id: actionId } });
    expect(after!.status).toBe('FAILED');
    expect(after!.executedAt).toBeNull();
    expect(await db.consentReceipt.count()).toBe(0);
  });

  it('a fresh process reports the gate as present, rather than an empty list', async () => {
    // The specific lie the Map told: after a restart the gates page still
    // rendered, and it rendered nothing, and nothing was stopping anything.
    await registerBlockingGate(tenantA);

    jest.resetModules();

    const freshGate = await import('@/modules/execution/services/execution-gate');
    const freshAuth = await import('@/shared/middleware/auth');
    const scope = await freshAuth.verifyEntityForUser(
      tenantA.entity.id,
      tenantA.user.id
    );

    const gates = await freshGate.listGates(scope!);
    expect(gates.map((g) => g.name)).toEqual(['Halt']);
  });
});

describe('T-034 — the execution gate resists a direct service call', () => {
  it('blocks an action called straight at the service, with no request in play', async () => {
    // Routes are not the only caller. The runbook engine and the queue worker
    // reach `executeAction` directly, so a gate enforced only in the route
    // layer would be no gate at all.
    await registerBlockingGate(tenantA);
    const actionId = await approvedAction(tenantA);

    const { executeAction } = await import(
      '@/modules/execution/services/action-queue'
    );
    const scope = await verifyEntityForUser(tenantA.entity.id, tenantA.user.id);

    await expect(executeAction(actionId, scope!)).rejects.toThrow(
      /Execution blocked by gate/
    );

    const after = await db.queuedAction.findUnique({ where: { id: actionId } });
    expect(after!.status).toBe('FAILED');
    expect(
      (await db.actionLog.findUnique({ where: { id: after!.actionLogId } }))!.status
    ).not.toBe('EXECUTED');
  });

  it('lets the action through once the gate is switched off by its OWNER', async () => {
    // Symmetry, and proof the block is the gate rather than a service that
    // refuses everything: the same call succeeds when the owner disables it.
    const gateId = await registerBlockingGate(tenantA);
    const actionId = await approvedAction(tenantA);

    const off = await gatesPUT(
      requestAs(tenantA, '/api/execution/gates', {
        method: 'PUT',
        body: { id: gateId, isActive: false },
      })
    );
    expect(off.status).toBe(200);

    const res = await queueItemPATCH(
      requestAs(tenantA, `/api/execution/queue/${actionId}`, {
        method: 'PATCH',
        body: { action: 'EXECUTE' },
      }),
      ctx(actionId)
    );

    expect(res.status).toBe(200);
    expect(
      (await db.queuedAction.findUnique({ where: { id: actionId } }))!.status
    ).toBe('EXECUTED');
  });
});

describe('T-034 — the execution gate cannot be removed by another tenant', () => {
  it("refuses tenant B's attempt to delete the gate, and it still blocks", async () => {
    const gateId = await registerBlockingGate(tenantA);
    const actionId = await approvedAction(tenantA);

    const del = await gatesDELETE(
      requestAs(tenantB, '/api/execution/gates', {
        method: 'DELETE',
        body: { id: gateId },
      })
    );
    expect(del.status).toBe(404);

    const res = await queueItemPATCH(
      requestAs(tenantA, `/api/execution/queue/${actionId}`, {
        method: 'PATCH',
        body: { action: 'EXECUTE' },
      }),
      ctx(actionId)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('GATE_BLOCKED');
  });

  it("refuses tenant B's attempt to switch the gate inactive, and it still blocks", async () => {
    // Disabling is the quieter bypass: the rule is still listed, so a reviewer
    // sees a gate; it just no longer stops anything.
    const gateId = await registerBlockingGate(tenantA);
    const actionId = await approvedAction(tenantA);

    const put = await gatesPUT(
      requestAs(tenantB, '/api/execution/gates', {
        method: 'PUT',
        body: { id: gateId, isActive: false },
      })
    );
    expect(put.status).toBe(404);
    expect(
      (await db.executionGateRule.findUnique({ where: { id: gateId } }))!.isActive
    ).toBe(true);

    const res = await queueItemPATCH(
      requestAs(tenantA, `/api/execution/queue/${actionId}`, {
        method: 'PATCH',
        body: { action: 'EXECUTE' },
      }),
      ctx(actionId)
    );

    expect(res.status).toBe(403);
  });

  it("one tenant's gate does not block another tenant's action", async () => {
    // The mirror of a bypass: a rule one tenant can install into everyone
    // else's execution path is a cross-tenant denial of service.
    await registerBlockingGate(tenantA);
    const theirAction = await approvedAction(tenantB);

    const res = await queueItemPATCH(
      requestAs(tenantB, `/api/execution/queue/${theirAction}`, {
        method: 'PATCH',
        body: { action: 'EXECUTE' },
      }),
      ctx(theirAction)
    );

    expect(res.status).toBe(200);
    expect(
      (await db.queuedAction.findUnique({ where: { id: theirAction } }))!.status
    ).toBe('EXECUTED');
  });
});
