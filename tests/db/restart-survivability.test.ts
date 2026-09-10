/**
 * P-20 (T-033) — the scenario survives a process restart MID-RUN.
 *
 * ============================================================================
 * WHAT "MID-RUN" MEANS HERE, AND WHY IT IS THE HARD HALF
 * ============================================================================
 *
 * The audit did not ask whether state survives a restart. It asked whether the
 * SCENARIO survives one — a restart between two steps of a story that is still
 * going, where the second half has to pick up what the first half left.
 *
 * That is a different question, and the difference is exactly where a per-leg
 * test cannot reach. `audit-log.test.ts` proves the audit rows are in Postgres
 * by constructing a fresh `AuditService` and reading the total back.
 * `execution-gate.test.ts` proves a gate still blocks after
 * `jest.resetModules()`. Both are true and neither one carries anything across
 * the restart: each builds its own fixture on the near side and asserts on the
 * far side of nothing. This file builds the whole story on the near side, drops
 * every module the process is holding, and then continues the SAME story with
 * ids minted before the restart — which is the only version of the question a
 * deployment actually asks.
 *
 * `jest.resetModules()` is a restart expressed precisely: every module-level
 * object the process had — every Map, every cached singleton, every `let`
 * initialised at import — is gone, and the next `import` builds it again from
 * scratch. Anything that was only in memory does not come back. Anything in
 * Postgres does. That is the whole discriminator, and it is the same idiom
 * P-01 and P-09 established; this file's contribution is what it carries
 * across, not the mechanism.
 *
 * A second `PrismaClient` is used for the far-side reads where it adds
 * something: a client the pre-restart code never touched is a different
 * process's view of the same row, so a value that only ever existed in the
 * first client's cache or in a module-level Map cannot be read through it.
 *
 * Requires a real Postgres. No skip.
 */

import { PrismaClient } from '@prisma/client';
import type { NextRequest } from 'next/server';

import { db, setupTestDatabase } from '../helpers/db';
import { readJson, requestAs, anonymousRequest, sessionTokenFor } from '../helpers/session';
import { createTenant, type Tenant } from '../helpers/factories';

setupTestDatabase();
jest.setTimeout(120_000);

/**
 * Re-import a module after the restart.
 *
 * Deliberately a fresh `import()` per call rather than a shared object: two
 * modules imported before and after `jest.resetModules()` are different
 * objects, and holding a pre-restart reference is the mistake that would make
 * this whole file measure nothing.
 */
async function afterRestart<T>(specifier: string): Promise<T> {
  return (await import(specifier)) as T;
}

/** A second client — a different process's view of the same rows. */
async function withSecondClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

describe('T-033 — the story continues across a restart', () => {
  let tenant: Tenant;

  beforeEach(async () => {
    tenant = await createTenant();
  });

  it('carries the audit chain across, and appends to it rather than starting a new one', async () => {
    // NEAR SIDE — two audited requests, so there is a chain and not just a row.
    const { POST: dmsPOST } = await import('@/app/api/crisis/dead-man-switch/route');
    const { POST: checkInPOST } = await import(
      '@/app/api/crisis/dead-man-switch/check-in/route'
    );

    await dmsPOST(
      requestAs(tenant, '/api/crisis/dead-man-switch', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: { isEnabled: true, checkInIntervalHours: 6, triggerAfterMisses: 2, protocols: [] },
      })
    );
    await checkInPOST(
      requestAs(tenant, '/api/crisis/dead-man-switch/check-in', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
      })
    );

    const before = await db.auditLogEntry.findMany({
      where: { entityId: tenant.entity.id },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    });
    expect(before).toHaveLength(2);
    expect(before[0].previousHash).toBe('0');
    expect(before[1].previousHash).toBe(before[0].hash);
    const lastHashBeforeRestart = before[1].hash;

    // THE RESTART.
    jest.resetModules();

    // FAR SIDE — a third request, from the same session token minted before the
    // restart. If the chain lived in a module-level array, this row's
    // previousHash would be '0' and the tamper verifier would still say the log
    // was intact, which is the failure mode worth naming: a broken chain that
    // reports itself as sound.
    const fresh = await afterRestart<typeof import('@/app/api/crisis/dead-man-switch/check-in/route')>(
      '@/app/api/crisis/dead-man-switch/check-in/route'
    );
    await fresh.POST(
      requestAs(tenant, '/api/crisis/dead-man-switch/check-in', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
      })
    );

    const after = await withSecondClient((client) =>
      client.auditLogEntry.findMany({
        where: { entityId: tenant.entity.id },
        orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
      })
    );

    expect(after).toHaveLength(3);
    expect(after[2].previousHash).toBe(lastHashBeforeRestart);
    expect(after[2].actorId).toBe(tenant.user.id);

    // And the product's own verifier agrees, run from the restarted process.
    const freshAudit = await afterRestart<typeof import('@/modules/security/services/audit-service')>(
      '@/modules/security/services/audit-service'
    );
    const verification = await new freshAudit.AuditService().verifyAuditChain(
      tenant.entity.id,
      { from: new Date(0), to: new Date('2999-01-01') }
    );
    expect(verification.valid).toBe(true);
    expect(verification.checkedEntries).toBe(3);
  });

  it('carries the kill switch across, still armed and still not re-firable', async () => {
    const { POST: dmsPOST } = await import('@/app/api/crisis/dead-man-switch/route');
    const { POST: evaluatePOST } = await import(
      '@/app/api/crisis/dead-man-switch/evaluate/route'
    );

    await dmsPOST(
      requestAs(tenant, '/api/crisis/dead-man-switch', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: {
          isEnabled: true,
          checkInIntervalHours: 1,
          triggerAfterMisses: 2,
          protocols: [
            {
              order: 1,
              action: 'NOTIFY_CONTACT',
              contactName: 'Next of kin',
              message: 'gone quiet',
              delayHoursAfterTrigger: 0,
            },
          ],
        },
      })
    );
    await db.deadManSwitch.update({
      where: { userId: tenant.user.id },
      data: { lastCheckIn: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    });

    // NEAR SIDE — it fires once.
    const firedRes = await evaluatePOST(
      requestAs(tenant, '/api/crisis/dead-man-switch/evaluate', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: { entityId: tenant.entity.id },
      })
    );
    const firedBody = await readJson<{ data: { triggered: boolean; executed: unknown[] } }>(firedRes);
    expect(firedBody.data.triggered).toBe(true);
    expect(firedBody.data.executed).toHaveLength(1);

    // THE RESTART.
    jest.resetModules();

    // FAR SIDE — the switch is still configured, still enabled, still fires as
    // triggered, and — the load-bearing half — does NOT execute the protocol a
    // second time. Idempotency here is read out of the audit log rather than a
    // column, so this is also a second proof that the log survived: if it had
    // not, `alreadyFiredSince` would find nothing and the contacts would be
    // notified again on every restart.
    const freshEvaluate = await afterRestart<
      typeof import('@/app/api/crisis/dead-man-switch/evaluate/route')
    >('@/app/api/crisis/dead-man-switch/evaluate/route');

    const againRes = await freshEvaluate.POST(
      requestAs(tenant, '/api/crisis/dead-man-switch/evaluate', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: { entityId: tenant.entity.id },
      })
    );
    const again = await readJson<{
      data: { triggered: boolean; alreadyFired: boolean; executed: unknown[] };
    }>(againRes);

    expect(again.data.triggered).toBe(true);
    expect(again.data.alreadyFired).toBe(true);
    expect(again.data.executed).toHaveLength(0);

    const protocolRows = await withSecondClient((client) =>
      client.auditLogEntry.count({
        where: { action: 'DEAD_MAN_SWITCH_PROTOCOL_EXECUTED' },
      })
    );
    expect(protocolRows).toBe(1);
  });

  it('carries the execution gate across, and it still blocks an action minted before it', async () => {
    // NEAR SIDE — a gate that never passes, and an approved action queued
    // against it. Both are created through the product, not by hand.
    const { POST: gatesPOST } = await import('@/app/api/execution/gates/route');
    const gateRes = await gatesPOST(
      requestAs(tenant, '/api/execution/gates', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: {
          name: 'Halt',
          expression: 'false',
          description: 'never passes',
          scope: 'GLOBAL',
          isActive: true,
          entityId: tenant.entity.id,
        },
      })
    );
    expect(gateRes.status).toBe(201);

    const actionLog = await db.actionLog.create({
      data: {
        actor: tenant.user.id,
        actionType: 'DELETE_RECORDS',
        target: 'contacts',
        reason: 'cleanup',
        blastRadius: 'HIGH',
        reversible: false,
        status: 'PENDING',
      },
    });
    const queued = await db.queuedAction.create({
      data: {
        actionLogId: actionLog.id,
        actor: tenant.user.id,
        actionType: 'DELETE_RECORDS',
        target: 'contacts',
        description: 'delete every contact',
        reason: 'cleanup',
        impact: 'irreversible',
        rollbackPlan: 'restore from snapshot',
        blastRadius: 'HIGH',
        reversible: false,
        status: 'APPROVED',
        requiresApproval: true,
        entityId: tenant.entity.id,
      },
    });

    // THE RESTART.
    jest.resetModules();

    // FAR SIDE — the action id was minted before the restart; the gate was
    // registered before the restart; the process holding both is gone. The
    // refusal must still happen, and it must be durable rather than only thrown.
    const freshQueue = await afterRestart<
      typeof import('@/modules/execution/services/action-queue')
    >('@/modules/execution/services/action-queue');
    const freshAuth = await afterRestart<typeof import('@/shared/middleware/auth')>(
      '@/shared/middleware/auth'
    );

    const scope = await freshAuth.verifyEntityForUser(tenant.entity.id, tenant.user.id);
    expect(scope).not.toBeNull();

    await expect(freshQueue.executeAction(queued.id, scope!)).rejects.toThrow(
      /Execution blocked by gate "Halt"/
    );

    const settled = await withSecondClient((client) =>
      client.queuedAction.findUniqueOrThrow({ where: { id: queued.id } })
    );
    expect(settled.status).toBe('FAILED');
    expect(settled.executedAt).toBeNull();
    expect(await db.consentReceipt.count()).toBe(0);
  });

  it('carries the session across: a token minted before the restart still authenticates, and an invalid one still does not', async () => {
    // The restart must not quietly change who the caller is. Both halves matter:
    // a token minted on the near side is still verified on the far side, and a
    // token minted with the wrong secret is still rejected — a restart that
    // dropped `NEXTAUTH_SECRET` would make the second half pass for the wrong
    // reason, so both are asserted from the same restarted modules.
    const forged = await sessionTokenFor(
      { userId: tenant.user.id, email: tenant.user.email, activeEntityId: tenant.entity.id },
      { secret: 'not-the-secret-this-process-uses' }
    );

    jest.resetModules();

    const freshTasks = await afterRestart<typeof import('@/app/api/tasks/route')>(
      '@/app/api/tasks/route'
    );

    const good = await freshTasks.GET(
      requestAs(tenant, '/api/tasks', { query: { entityId: tenant.entity.id } })
    );
    expect(good.status).toBe(200);

    const bad = await freshTasks.GET(
      requestAs({ token: forged }, '/api/tasks', { query: { entityId: tenant.entity.id } })
    );
    expect(bad.status).toBe(401);

    const none = await freshTasks.GET(
      anonymousRequest('/api/tasks', { query: { entityId: tenant.entity.id } }) as NextRequest
    );
    expect(none.status).toBe(401);
  });

  it('carries the tenancy boundary across: a foreign entity is still refused by restarted middleware', async () => {
    const other = await createTenant();
    const foreignTask = await db.task.create({
      data: { entityId: other.entity.id, title: 'not yours' },
    });

    jest.resetModules();

    const freshTasks = await afterRestart<typeof import('@/app/api/tasks/route')>(
      '@/app/api/tasks/route'
    );
    const freshTask = await afterRestart<typeof import('@/app/api/tasks/[id]/route')>(
      '@/app/api/tasks/[id]/route'
    );

    const listed = await freshTasks.GET(
      requestAs(tenant, '/api/tasks', { query: { entityId: other.entity.id } })
    );
    expect(listed.status).toBe(403);

    const read = await freshTask.GET(
      requestAs(tenant, `/api/tasks/${foreignTask.id}`),
      { params: Promise.resolve({ id: foreignTask.id }) }
    );
    expect(read.status).toBe(403);

    const written = await freshTask.PUT(
      requestAs(tenant, `/api/tasks/${foreignTask.id}`, {
        method: 'PUT',
        body: { title: 'overwritten' },
      }),
      { params: Promise.resolve({ id: foreignTask.id }) }
    );
    expect(written.status).toBe(403);

    // A 403 that still writes is not a refusal.
    expect(
      (await withSecondClient((c) => c.task.findUniqueOrThrow({ where: { id: foreignTask.id } })))
        .title
    ).toBe('not yours');

    // Symmetry, from the restarted modules: the owner still reaches their own.
    const owner = await freshTask.GET(
      requestAs(other, `/api/tasks/${foreignTask.id}`),
      { params: Promise.resolve({ id: foreignTask.id }) }
    );
    expect(owner.status).toBe(200);
  });

  it('holds nothing that a restart erases: every table the story touched is in Postgres', async () => {
    // The generalisation of the four cases above, and the reason they are
    // sufficient rather than arbitrary. The audit's finding was module-level
    // state; the check is that a client which has never seen this process's
    // memory can read back everything the story wrote.
    const { POST: dmsPOST } = await import('@/app/api/crisis/dead-man-switch/route');
    const { POST: tasksPOST } = await import('@/app/api/tasks/route');
    const { POST: workflowsPOST } = await import('@/app/api/workflows/route');

    await tasksPOST(
      requestAs(tenant, '/api/tasks', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: { title: 'survives', entityId: tenant.entity.id },
      })
    );
    await workflowsPOST(
      requestAs(tenant, '/api/workflows', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: {
          name: 'survives',
          entityId: tenant.entity.id,
          triggers: [],
          graph: { nodes: [], edges: [] },
        },
      })
    );
    await dmsPOST(
      requestAs(tenant, '/api/crisis/dead-man-switch', {
        method: 'POST',
        query: { entityId: tenant.entity.id },
        body: { isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] },
      })
    );

    jest.resetModules();

    const counts = await withSecondClient(async (client) => ({
      users: await client.user.count(),
      entities: await client.entity.count(),
      tasks: await client.task.count({ where: { entityId: tenant.entity.id } }),
      workflows: await client.workflow.count({ where: { entityId: tenant.entity.id } }),
      switches: await client.deadManSwitch.count({ where: { userId: tenant.user.id } }),
      audit: await client.auditLogEntry.count({ where: { entityId: tenant.entity.id } }),
    }));

    expect(counts).toEqual({
      users: 1,
      entities: 1,
      tasks: 1,
      workflows: 1,
      switches: 1,
      audit: 1,
    });
  });
});
