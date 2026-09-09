/**
 * P-09 acceptance — Execution, Workflows and Rules tenancy, against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * 28 route files live under `/api/execution`, `/api/workflows` and `/api/rules`.
 * 26 of them called
 *
 *     withAuth(request, async (req, _session) => ...)
 *
 * and then took the tenant from the caller's own request -- 93%, the worst
 * ratio in the codebase. `src/modules/execution/` contained ZERO references to
 * `userId` anywhere in ten files.
 *
 * This module is the platform's CONTROL PLANE: the action queue, the execution
 * gate, the approval queue, the rollback engine. These are the mechanisms that
 * are supposed to STOP things. So the failures here are not only "A can read
 * B's data"; they are:
 *
 *     PATCH /api/execution/queue/<B's id>   { "action": "EXECUTE" }
 *     POST  /api/execution/rollback/<B's id>
 *     POST  /api/workflows/<B's id>/trigger
 *     POST  /api/workflows/approvals        { "approverId": "<anyone>" }
 *
 * -- executing, reversing, and approving another tenant's work. A gate that is
 * bypassable is worse than no gate, because the console reports the action as
 * protected either way.
 *
 * Every case below is one of four shapes:
 *
 *   1. the owner reaches their own entity                      -> 200/201
 *   2. tenant A cannot READ tenant B's control plane           -> 403/404/empty
 *   3. tenant A cannot ACT on tenant B's control plane         -> 403 AND
 *                                                                 nothing in
 *                                                                 the database
 *                                                                 changed
 *   4. no session at all                                       -> 401
 *
 * plus the three the tenancy pattern calls out specifically: a LIST route that
 * returns nothing of B's on an ordinary request (not merely one that refuses
 * `?entityId=B`), a BULK route that reports `0` and changes nothing, and
 * SYMMETRY -- B reaches B's own data, because a "fix" that denies everyone
 * passes every other assertion in the file.
 *
 * Real Postgres, `getToken` UNMOCKED: each request carries a genuine NextAuth
 * JWE and the production decrypt path runs.
 */

import {
  GET as queueGET,
  POST as queuePOST,
} from '@/app/api/execution/queue/route';
import {
  GET as queueItemGET,
  PATCH as queueItemPATCH,
  DELETE as queueItemDELETE,
} from '@/app/api/execution/queue/[id]/route';
import { POST as queueBulkPOST } from '@/app/api/execution/queue/bulk/route';
import {
  GET as gatesGET,
  POST as gatesPOST,
  PUT as gatesPUT,
  DELETE as gatesDELETE,
} from '@/app/api/execution/gates/route';
import {
  GET as runbooksGET,
  POST as runbooksPOST,
} from '@/app/api/execution/runbooks/route';
import {
  GET as runbookGET,
  PUT as runbookPUT,
  DELETE as runbookDELETE,
} from '@/app/api/execution/runbooks/[id]/route';
import { POST as runbookExecutePOST } from '@/app/api/execution/runbooks/[id]/execute/route';
import { GET as runbookExecutionsGET } from '@/app/api/execution/runbooks/[id]/executions/route';
import {
  GET as rollbackGET,
  POST as rollbackPOST,
} from '@/app/api/execution/rollback/[id]/route';
import { GET as timelineGET } from '@/app/api/execution/timeline/route';
import { GET as timelineSummaryGET } from '@/app/api/execution/timeline/summary/route';
import { GET as costsGET } from '@/app/api/execution/costs/route';
import { POST as simulatePOST } from '@/app/api/execution/simulate/route';
import { GET as statsGET } from '@/app/api/execution/stats/route';

import {
  GET as workflowsGET,
  POST as workflowsPOST,
} from '@/app/api/workflows/route';
import {
  GET as workflowGET,
  PUT as workflowPUT,
  DELETE as workflowDELETE,
} from '@/app/api/workflows/[id]/route';
import { POST as workflowTriggerPOST } from '@/app/api/workflows/[id]/trigger/route';
import { POST as workflowSimulatePOST } from '@/app/api/workflows/[id]/simulate/route';
import { GET as workflowExecutionsGET } from '@/app/api/workflows/[id]/executions/route';

import {
  GET as rulesGET,
  POST as rulesPOST,
} from '@/app/api/rules/route';
import {
  GET as ruleGET,
  PUT as rulePUT,
  DELETE as ruleDELETE,
} from '@/app/api/rules/[id]/route';
import { POST as ruleEvaluatePOST } from '@/app/api/rules/evaluate/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };
type PageBody<T> = { success: true; data: T[]; meta: { total: number } };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

// ---------------------------------------------------------------------------
// Fixtures written directly, so a broken write path cannot fake a passing read
// ---------------------------------------------------------------------------

async function seedAction(
  tenant: Tenant,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; actionLogId: string }> {
  const log = await db.actionLog.create({
    data: {
      actor: 'AI',
      actionType: 'CREATE_TASK',
      target: 'tasks/t-1',
      reason: 'fixture',
      blastRadius: 'LOW',
      reversible: true,
      status: 'PENDING',
    },
  });

  const action = await db.queuedAction.create({
    data: {
      actionLogId: log.id,
      actor: 'AI',
      actionType: 'CREATE_TASK',
      target: 'tasks/t-1',
      description: 'Create a task',
      reason: 'fixture',
      impact: 'low',
      rollbackPlan: 'delete it',
      blastRadius: 'LOW',
      reversible: true,
      status: 'QUEUED',
      requiresApproval: true,
      entityId: tenant.entity.id,
      ...overrides,
    },
  });

  return { id: action.id, actionLogId: log.id };
}

async function seedRunbook(tenant: Tenant): Promise<string> {
  const runbook = await db.runbook.create({
    data: {
      entityId: tenant.entity.id,
      name: 'Nightly close',
      description: 'fixture',
      steps: [
        {
          order: 1,
          name: 'Step 1',
          description: 'first',
          actionType: 'CREATE_TASK',
          parameters: {},
          requiresApproval: false,
          maxBlastRadius: 'LOW',
          continueOnFailure: false,
        },
      ],
      category: 'finance',
      isActive: true,
      createdBy: tenant.user.id,
    },
  });
  return runbook.id;
}

async function seedWorkflow(tenant: Tenant): Promise<string> {
  const workflow = await db.workflow.create({
    data: {
      name: 'Nightly workflow',
      entityId: tenant.entity.id,
      status: 'ACTIVE',
      triggers: [{ type: 'MANUAL', config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' } }],
      steps: {
        nodes: [
          {
            id: 'n1',
            type: 'TRIGGER',
            label: 'Start',
            config: { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
            position: { x: 0, y: 0 },
            inputs: [],
            outputs: [],
          },
        ],
        edges: [],
      },
    },
  });
  return workflow.id;
}

async function seedRule(tenant: Tenant): Promise<string> {
  const rule = await db.rule.create({
    data: {
      name: 'Never send after hours',
      scope: 'ENTITY',
      entityId: tenant.entity.id,
      condition: { field: 'hour', op: 'gt', value: 18 },
      action: { type: 'BLOCK' },
      precedence: 10,
      createdBy: 'HUMAN',
      isActive: true,
    },
  });
  return rule.id;
}

// ===========================================================================
// The action queue -- approve, execute, cancel
// ===========================================================================

describe('POST /api/execution/queue', () => {
  const body = {
    actionType: 'CREATE_TASK',
    target: 'tasks',
    description: 'Create a task',
    reason: 'because',
    impact: 'low',
    rollbackPlan: 'delete it',
    blastRadius: 'LOW' as const,
    reversible: true,
    actor: 'HUMAN' as const,
  };

  it('queues an action into the caller’s own entity', async () => {
    const res = await queuePOST(
      requestAs(tenantA, '/api/execution/queue', { method: 'POST', body })
    );
    expect(res.status).toBe(201);

    const rows = await db.queuedAction.findMany({
      where: { entityId: tenantA.entity.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("refuses to queue an action into tenant B's entity, and writes nothing", async () => {
    const res = await queuePOST(
      requestAs(tenantA, '/api/execution/queue', {
        method: 'POST',
        body: { ...body, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');

    // A 403 that still writes is not a fix.
    expect(
      await db.queuedAction.count({ where: { entityId: tenantB.entity.id } })
    ).toBe(0);
  });

  it('records the authenticated caller as the actor, not the body', async () => {
    // Before P-09 the body chose `actorId`, so the audit trail named whoever
    // the requester decided to name.
    const res = await queuePOST(
      requestAs(tenantA, '/api/execution/queue', {
        method: 'POST',
        body: { ...body, actorId: tenantB.user.id },
      })
    );
    expect(res.status).toBe(201);

    const row = await db.queuedAction.findFirst({
      where: { entityId: tenantA.entity.id },
    });
    expect(row!.actorId).toBe(tenantA.user.id);
  });

  it('returns 401 with no session', async () => {
    const res = await queuePOST(
      anonymousRequest('/api/execution/queue', { method: 'POST', body })
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/execution/queue (list)', () => {
  it("an ordinary request returns nothing of tenant B's", async () => {
    // Not merely "refuses ?entityId=B": leaking rows is a different failure
    // from a single-record 403.
    await seedAction(tenantA);
    await seedAction(tenantB);

    const res = await queueGET(requestAs(tenantA, '/api/execution/queue'));
    expect(res.status).toBe(200);

    const body = await readJson<PageBody<{ entityId: string }>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
    expect(body.meta.total).toBe(1);
  });

  it('refuses an explicit ?entityId= naming another tenant', async () => {
    await seedAction(tenantB);

    const res = await queueGET(
      requestAs(tenantA, `/api/execution/queue?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('symmetry: tenant B reaches tenant B’s own queue', async () => {
    await seedAction(tenantA);
    const mine = await seedAction(tenantB);

    const res = await queueGET(requestAs(tenantB, '/api/execution/queue'));
    const body = await readJson<PageBody<{ id: string }>>(res);

    expect(body.data.map((a) => a.id)).toEqual([mine.id]);
  });

  it('returns 401 with no session', async () => {
    expect((await queueGET(anonymousRequest('/api/execution/queue'))).status).toBe(401);
  });
});

describe('/api/execution/queue/:id', () => {
  it('reads the caller’s own action', async () => {
    const mine = await seedAction(tenantA);

    const res = await queueItemGET(
      requestAs(tenantA, `/api/execution/queue/${mine.id}`),
      ctx(mine.id)
    );
    expect(res.status).toBe(200);
  });

  it("refuses to read tenant B's action", async () => {
    const theirs = await seedAction(tenantB);

    const res = await queueItemGET(
      requestAs(tenantA, `/api/execution/queue/${theirs.id}`),
      ctx(theirs.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to APPROVE tenant B's action, and it stays QUEUED", async () => {
    const theirs = await seedAction(tenantB);

    const res = await queueItemPATCH(
      requestAs(tenantA, `/api/execution/queue/${theirs.id}`, {
        method: 'PATCH',
        body: { action: 'APPROVE' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);

    const after = await db.queuedAction.findUnique({ where: { id: theirs.id } });
    expect(after!.status).toBe('QUEUED');
    expect(after!.approvedBy).toBeNull();
  });

  it("refuses to EXECUTE tenant B's action, and it is not executed", async () => {
    const theirs = await seedAction(tenantB, { status: 'APPROVED' });

    const res = await queueItemPATCH(
      requestAs(tenantA, `/api/execution/queue/${theirs.id}`, {
        method: 'PATCH',
        body: { action: 'EXECUTE' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);

    const after = await db.queuedAction.findUnique({ where: { id: theirs.id } });
    expect(after!.status).toBe('APPROVED');
    expect(after!.executedAt).toBeNull();
    expect(await db.consentReceipt.count()).toBe(0);
  });

  it("refuses to CANCEL tenant B's action", async () => {
    const theirs = await seedAction(tenantB);

    const res = await queueItemDELETE(
      requestAs(tenantA, `/api/execution/queue/${theirs.id}`, { method: 'DELETE' }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect(
      (await db.queuedAction.findUnique({ where: { id: theirs.id } }))!.status
    ).toBe('QUEUED');
  });

  it('records the SESSION user as the approver, not a body field', async () => {
    const mine = await seedAction(tenantA);

    const res = await queueItemPATCH(
      requestAs(tenantA, `/api/execution/queue/${mine.id}`, {
        method: 'PATCH',
        body: { action: 'APPROVE', approverId: tenantB.user.id },
      }),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);

    const after = await db.queuedAction.findUnique({ where: { id: mine.id } });
    expect(after!.approvedBy).toBe(tenantA.user.id);
  });

  it('returns 401 with no session', async () => {
    const mine = await seedAction(tenantA);
    const res = await queueItemGET(
      anonymousRequest(`/api/execution/queue/${mine.id}`),
      ctx(mine.id)
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/execution/queue/bulk', () => {
  it('reports 0 approved for foreign ids, and changes nothing', async () => {
    const theirs1 = await seedAction(tenantB);
    const theirs2 = await seedAction(tenantB);

    const res = await queueBulkPOST(
      requestAs(tenantA, '/api/execution/queue/bulk', {
        method: 'POST',
        body: {
          action: 'APPROVE',
          actionIds: [theirs1.id, theirs2.id],
        },
      })
    );

    expect(res.status).toBe(200);
    expect(await readJson<OkBody<{ approved: number; failed: number }>>(res)).toMatchObject({
      success: true,
      data: { approved: 0, failed: 2 },
    });

    expect(
      await db.queuedAction.count({
        where: { entityId: tenantB.entity.id, status: 'QUEUED' },
      })
    ).toBe(2);
  });

  it('approves the caller’s own ids', async () => {
    const mine = await seedAction(tenantA);

    const res = await queueBulkPOST(
      requestAs(tenantA, '/api/execution/queue/bulk', {
        method: 'POST',
        body: { action: 'APPROVE', actionIds: [mine.id] },
      })
    );

    expect(res.status).toBe(200);
    expect(
      (await db.queuedAction.findUnique({ where: { id: mine.id } }))!.status
    ).toBe('APPROVED');
  });
});

// ===========================================================================
// Rollback -- reversing another tenant's executed work
// ===========================================================================

describe('/api/execution/rollback/:id', () => {
  it("refuses to build a rollback plan for tenant B's action", async () => {
    const theirs = await seedAction(tenantB, { status: 'EXECUTED' });

    const res = await rollbackGET(
      requestAs(tenantA, `/api/execution/rollback/${theirs.id}`),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect(await db.rollbackPlan.count()).toBe(0);
  });

  it("refuses to EXECUTE a rollback of tenant B's action, and nothing is reversed", async () => {
    const theirs = await seedAction(tenantB, { status: 'EXECUTED' });

    const res = await rollbackPOST(
      requestAs(tenantA, `/api/execution/rollback/${theirs.id}`, { method: 'POST' }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);

    const after = await db.queuedAction.findUnique({ where: { id: theirs.id } });
    expect(after!.status).toBe('EXECUTED');
    expect(
      (await db.actionLog.findUnique({ where: { id: theirs.actionLogId } }))!.status
    ).not.toBe('ROLLED_BACK');
  });

  it('rolls back the caller’s own action', async () => {
    const mine = await seedAction(tenantA, { status: 'EXECUTED' });

    const res = await rollbackPOST(
      requestAs(tenantA, `/api/execution/rollback/${mine.id}`, { method: 'POST' }),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
    expect(
      (await db.queuedAction.findUnique({ where: { id: mine.id } }))!.status
    ).toBe('ROLLED_BACK');
  });
});

// ===========================================================================
// Gates -- the mechanism that stops things
// ===========================================================================

describe('/api/execution/gates', () => {
  const gate = {
    name: 'No CRITICAL',
    expression: 'blastRadius != "CRITICAL"',
    description: 'Block critical actions',
    scope: 'ENTITY' as const,
    isActive: true,
  };

  it('creates a gate owned by the caller’s entity, whatever the body says', async () => {
    const res = await gatesPOST(
      requestAs(tenantA, '/api/execution/gates', {
        method: 'POST',
        body: { ...gate, entityId: tenantB.entity.id },
      })
    );

    // The body named B, so the scope resolver refuses outright rather than
    // silently rewriting it.
    expect(res.status).toBe(403);
    expect(await db.executionGateRule.count()).toBe(0);

    const ok = await gatesPOST(
      requestAs(tenantA, '/api/execution/gates', { method: 'POST', body: gate })
    );
    expect(ok.status).toBe(201);

    const row = await db.executionGateRule.findFirst();
    expect(row!.entityId).toBe(tenantA.entity.id);
  });

  it('lists only the caller’s own gates on an ordinary request', async () => {
    await db.executionGateRule.create({
      data: { ...gate, entityId: tenantA.entity.id },
    });
    await db.executionGateRule.create({
      data: { ...gate, name: 'Theirs', entityId: tenantB.entity.id },
    });

    const res = await gatesGET(requestAs(tenantA, '/api/execution/gates'));
    const body = await readJson<OkBody<{ name: string }[]>>(res);

    expect(body.data.map((g) => g.name)).toEqual(['No CRITICAL']);
  });

  it("refuses to DELETE tenant B's gate, and the gate survives", async () => {
    // Deleting someone else's gate is the same class of failure as bypassing
    // your own: the console still reports the action as protected.
    const theirs = await db.executionGateRule.create({
      data: { ...gate, entityId: tenantB.entity.id },
    });

    const res = await gatesDELETE(
      requestAs(tenantA, '/api/execution/gates', {
        method: 'DELETE',
        body: { id: theirs.id },
      })
    );

    expect(res.status).toBe(404);
    expect(await db.executionGateRule.count({ where: { id: theirs.id } })).toBe(1);
  });

  it("refuses to DISABLE tenant B's gate, and it stays active", async () => {
    const theirs = await db.executionGateRule.create({
      data: { ...gate, entityId: tenantB.entity.id },
    });

    const res = await gatesPUT(
      requestAs(tenantA, '/api/execution/gates', {
        method: 'PUT',
        body: { id: theirs.id, isActive: false },
      })
    );

    expect(res.status).toBe(404);
    expect(
      (await db.executionGateRule.findUnique({ where: { id: theirs.id } }))!.isActive
    ).toBe(true);
  });

  it('returns 401 with no session', async () => {
    expect((await gatesGET(anonymousRequest('/api/execution/gates'))).status).toBe(401);
  });
});

// ===========================================================================
// Runbooks
// ===========================================================================

describe('/api/execution/runbooks', () => {
  const draft = {
    name: 'Client onboarding',
    description: 'fixture',
    steps: [
      {
        order: 1,
        name: 'Step 1',
        description: 'first',
        actionType: 'CREATE_TASK',
        parameters: {},
        requiresApproval: false,
        maxBlastRadius: 'LOW' as const,
        continueOnFailure: false,
      },
    ],
    tags: ['onboarding'],
    isActive: true,
  };

  it("refuses to create a runbook inside tenant B's entity, and writes nothing", async () => {
    const res = await runbooksPOST(
      requestAs(tenantA, '/api/execution/runbooks', {
        method: 'POST',
        body: { ...draft, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.runbook.count()).toBe(0);
  });

  it('lists only the caller’s own runbooks on an ordinary request', async () => {
    await seedRunbook(tenantA);
    await seedRunbook(tenantB);

    const res = await runbooksGET(requestAs(tenantA, '/api/execution/runbooks'));
    const body = await readJson<OkBody<{ entityId: string }[]>>(res);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
  });

  it("refuses to read, rewrite, run or delete tenant B's runbook", async () => {
    const theirs = await seedRunbook(tenantB);

    expect(
      (await runbookGET(requestAs(tenantA, `/x/${theirs}`), ctx(theirs))).status
    ).toBe(403);

    const put = await runbookPUT(
      requestAs(tenantA, `/x/${theirs}`, {
        method: 'PUT',
        body: { name: 'Hijacked' },
      }),
      ctx(theirs)
    );
    expect(put.status).toBe(403);

    const run = await runbookExecutePOST(
      requestAs(tenantA, `/x/${theirs}`, { method: 'POST', body: {} }),
      ctx(theirs)
    );
    expect(run.status).toBe(403);

    const del = await runbookDELETE(
      requestAs(tenantA, `/x/${theirs}`, { method: 'DELETE' }),
      ctx(theirs)
    );
    expect(del.status).toBe(403);

    // Nothing moved: same name, no runs, still there.
    const after = await db.runbook.findUnique({ where: { id: theirs } });
    expect(after!.name).toBe('Nightly close');
    expect(await db.runbookExecution.count()).toBe(0);
  });

  it("refuses to list tenant B's runbook executions", async () => {
    const theirs = await seedRunbook(tenantB);
    await db.runbookExecution.create({
      data: { runbookId: theirs, status: 'COMPLETED', stepResults: [], triggeredBy: 'x' },
    });

    const res = await runbookExecutionsGET(
      requestAs(tenantA, `/x/${theirs}`),
      ctx(theirs)
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Read-only surfaces: timeline, costs, stats, simulation
// ===========================================================================

describe('read-only execution surfaces', () => {
  it('the timeline returns nothing of tenant B’s on an ordinary request', async () => {
    // This was the quietest bug in the package: the old entity filter compared
    // an entity id against a TARGET STRING, matched nothing, and so returned
    // every tenant's audit trail on a request with no parameters at all.
    const mine = await seedAction(tenantA);
    await seedAction(tenantB);

    const res = await timelineGET(requestAs(tenantA, '/api/execution/timeline'));
    expect(res.status).toBe(200);

    const body = await readJson<PageBody<{ id: string }>>(res);
    expect(body.data.map((e) => e.id)).toEqual([mine.actionLogId]);
  });

  it('the activity summary counts only the caller’s own actions', async () => {
    await seedAction(tenantA);
    await seedAction(tenantB);
    await seedAction(tenantB);

    // An explicit window: the route's default `to` is todays date at midnight,
    // which excludes anything logged today. That is pre-existing display
    // behaviour and not what this test is about -- see
    // PARALLEL_BUILD_ESCALATION_P09.md.
    const res = await timelineSummaryGET(
      requestAs(
        tenantA,
        '/api/execution/timeline/summary?from=2026-01-01&to=2030-01-01'
      )
    );
    const body = await readJson<OkBody<{ totalActions: number }>>(res);

    expect(body.data.totalActions).toBe(1);
  });

  it('the daily cost summary counts only the caller’s own spend', async () => {
    // The old service filter ended in a literal `|| true`, so every tenant's
    // daily cost was the whole platform's.
    const mine = await seedAction(tenantA);
    const theirs = await seedAction(tenantB);
    await db.actionLog.update({
      where: { id: mine.actionLogId },
      data: { status: 'EXECUTED', cost: 1 },
    });
    await db.actionLog.update({
      where: { id: theirs.actionLogId },
      data: { status: 'EXECUTED', cost: 99 },
    });

    const res = await costsGET(requestAs(tenantA, '/api/execution/costs'));
    const body = await readJson<OkBody<{ totalCost: number }>>(res);

    expect(body.data.totalCost).toBe(1);
  });

  it('stats count only the caller’s own queue', async () => {
    await seedAction(tenantA);
    await seedAction(tenantB);
    await seedAction(tenantB);

    const res = await statsGET(requestAs(tenantA, '/api/execution/stats'));
    const body = await readJson<OkBody<{ pending: number }>>(res);

    expect(body.data.pending).toBe(1);
  });

  it('refuses to simulate against another tenant’s entity', async () => {
    const res = await simulatePOST(
      requestAs(tenantA, '/api/execution/simulate', {
        method: 'POST',
        body: {
          actionType: 'CREATE_TASK',
          target: 'tasks',
          parameters: {},
          entityId: tenantB.entity.id,
        },
      })
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Workflows
// ===========================================================================

describe('/api/workflows', () => {
  const draft = {
    name: 'New workflow',
    graph: { nodes: [], edges: [] },
    triggers: [],
  };

  it("refuses to create a workflow inside tenant B's entity, and writes nothing", async () => {
    const res = await workflowsPOST(
      requestAs(tenantA, '/api/workflows', {
        method: 'POST',
        body: { ...draft, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.workflow.count()).toBe(0);
  });

  it('lists only the caller’s own workflows on an ordinary request', async () => {
    await seedWorkflow(tenantA);
    await seedWorkflow(tenantB);

    const res = await workflowsGET(requestAs(tenantA, '/api/workflows'));
    const body = await readJson<PageBody<{ entityId: string }>>(res);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
  });

  it("refuses to read or re-graph tenant B's workflow, and it is unchanged", async () => {
    // Re-graphing is the interesting verb: it changes what the automation will
    // do to their records the next time it runs.
    const theirs = await seedWorkflow(tenantB);

    expect(
      (await workflowGET(requestAs(tenantA, `/x/${theirs}`), ctx(theirs))).status
    ).toBe(403);

    const put = await workflowPUT(
      requestAs(tenantA, `/x/${theirs}`, {
        method: 'PUT',
        body: { name: 'Hijacked', status: 'ARCHIVED' },
      }),
      ctx(theirs)
    );
    expect(put.status).toBe(403);

    const after = await db.workflow.findUnique({ where: { id: theirs } });
    expect(after!.name).toBe('Nightly workflow');
    expect(after!.status).toBe('ACTIVE');
  });

  it("refuses to ARCHIVE tenant B's workflow", async () => {
    const theirs = await seedWorkflow(tenantB);

    const res = await workflowDELETE(
      requestAs(tenantA, `/x/${theirs}`, { method: 'DELETE' }),
      ctx(theirs)
    );

    expect(res.status).toBe(403);
    expect(
      (await db.workflow.findUnique({ where: { id: theirs } }))!.status
    ).toBe('ACTIVE');
  });

  it("refuses to TRIGGER tenant B's workflow, and no run is recorded", async () => {
    const theirs = await seedWorkflow(tenantB);

    const res = await workflowTriggerPOST(
      requestAs(tenantA, `/x/${theirs}`, { method: 'POST', body: {} }),
      ctx(theirs)
    );

    expect(res.status).toBe(403);
    expect(await db.workflowExecutionRecord.count()).toBe(0);
  });

  it("refuses to SIMULATE tenant B's workflow", async () => {
    const theirs = await seedWorkflow(tenantB);

    const res = await workflowSimulatePOST(
      requestAs(tenantA, `/x/${theirs}`, { method: 'POST', body: {} }),
      ctx(theirs)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to read tenant B's run history", async () => {
    const theirs = await seedWorkflow(tenantB);
    await db.workflowExecutionRecord.create({
      data: { workflowId: theirs, status: 'COMPLETED', triggeredBy: 'x', triggerType: 'MANUAL' },
    });

    const res = await workflowExecutionsGET(
      requestAs(tenantA, `/x/${theirs}`),
      ctx(theirs)
    );
    expect(res.status).toBe(403);
  });

  it('symmetry: tenant B triggers tenant B’s own workflow, attributed to B', async () => {
    const mine = await seedWorkflow(tenantB);

    const res = await workflowTriggerPOST(
      requestAs(tenantB, `/x/${mine}`, {
        method: 'POST',
        body: { triggeredBy: tenantA.user.id },
      }),
      ctx(mine)
    );

    expect(res.status).toBe(201);

    const run = await db.workflowExecutionRecord.findFirst({
      where: { workflowId: mine },
    });
    // `triggeredBy` is the session's user id, not the one in the body.
    expect(run!.triggeredBy).toBe(tenantB.user.id);
  });

  it('returns 401 with no session', async () => {
    expect((await workflowsGET(anonymousRequest('/api/workflows'))).status).toBe(401);
  });
});

// ===========================================================================
// Policy rules -- what the platform is ALLOWED to do
// ===========================================================================

describe('/api/rules', () => {
  it('lists only the caller’s own rules on an ordinary request', async () => {
    await seedRule(tenantA);
    await seedRule(tenantB);

    const res = await rulesGET(requestAs(tenantA, '/api/rules'));
    const body = await readJson<PageBody<{ entityId: string | null }>>(res);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityId).toBe(tenantA.entity.id);
  });

  it("refuses to plant a rule inside tenant B's entity, and writes nothing", async () => {
    const res = await rulesPOST(
      requestAs(tenantA, '/api/rules', {
        method: 'POST',
        body: {
          name: 'Planted',
          scope: 'ENTITY',
          entityId: tenantB.entity.id,
          condition: {},
          action: {},
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.rule.count()).toBe(0);
  });

  it("refuses to read, rewrite or deactivate tenant B's rule", async () => {
    // Deactivating is the interesting verb: a rule that quietly stops applying
    // looks exactly like a rule that is still there.
    const theirs = await seedRule(tenantB);

    expect((await ruleGET(requestAs(tenantA, `/x/${theirs}`), ctx(theirs))).status).toBe(403);

    const put = await rulePUT(
      requestAs(tenantA, `/x/${theirs}`, { method: 'PUT', body: { isActive: false } }),
      ctx(theirs)
    );
    expect(put.status).toBe(403);

    const del = await ruleDELETE(
      requestAs(tenantA, `/x/${theirs}`, { method: 'DELETE' }),
      ctx(theirs)
    );
    expect(del.status).toBe(403);

    const after = await db.rule.findUnique({ where: { id: theirs } });
    expect(after!.isActive).toBe(true);
    expect(after!.name).toBe('Never send after hours');
  });

  it('refuses to evaluate against another tenant’s rule set', async () => {
    await seedRule(tenantB);

    const res = await ruleEvaluatePOST(
      requestAs(tenantA, '/api/rules/evaluate', {
        method: 'POST',
        body: { context: { hour: 20 }, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it('symmetry: tenant B reads tenant B’s own rule', async () => {
    const mine = await seedRule(tenantB);

    const res = await ruleGET(requestAs(tenantB, `/x/${mine}`), ctx(mine));
    expect(res.status).toBe(200);
  });

  it('returns 401 with no session', async () => {
    expect((await rulesGET(anonymousRequest('/api/rules'))).status).toBe(401);
  });
});
